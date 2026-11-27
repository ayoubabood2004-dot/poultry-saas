import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Notice';
import { Switch } from '../../components/ui/Switch';
import { describeError, RejectedError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import { MARK_COLORS, setStoreColors, type MarkColor, type StoreColors } from '../../lib/repo/storeMarks';
import { colorName, MARK_LOOK, stateWord } from './markColors';

// «ألوان الرصيد» (0039، كلمة المالك 2026-11-26: «من الاعدادات يكدر يخلي السستم تلقائيا… لمن مادة قليلة هيجي لونها ولمن مادة نافذة هيجي لونها»):
// «لوّن تلقائيّاً» ولون القلّة (رصيد عند حدّ المادّة أو أقلّ) ولون النفاد (صفر)، للمنشأة كلّها. واللون باليد على مادّة يغلب التلقائيّ. الحفظ بشرط
// النسخة التي عرضتها النافذة؛ وحين تأتي قراءة بنسخة غيرها (حفظها جهاز آخر) تُعرض الألوان الجديدة ويُقال ذلك، فلا يُكتب فوق ما لم يُرَ.

function Palette({ label, value, onPick, disabled, name }: { label: string; value: MarkColor; onPick: (color: MarkColor) => void; disabled: boolean; name: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {MARK_COLORS.map((color) => {
          const selected = color === value;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={colorName(color)}
              title={colorName(color)}
              disabled={disabled}
              onClick={() => onPick(color)}
              className={`inline-flex size-11 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50 ${selected ? 'border-ink' : 'border-transparent'}`}
              data-action={`colors-${name}`}
              data-color={color}
            >
              <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full" style={{ backgroundColor: MARK_LOOK[color].solid }}>
                {selected ? <Check className="size-4 text-white" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ColorsDialog({
  colors,
  onClose,
  onSaved,
  onReread,
  failed,
}: {
  /** الألوان في آخر قراءة ناجحة للشاشة. */
  colors: StoreColors;
  /** فشلت آخر قراءة للشاشة: بعد colors_changed يُقال ذلك بـ«أعد القراءة» ولا حفظ بنسخة لم تُقرأ. */
  failed: boolean;
  /** uncertain: نتيجة الحفظ مجهولة (لعلّه حُفظ)، فالشاشة تقرأ من جديد. */
  onClose: (uncertain: boolean) => void;
  onSaved: (colors: StoreColors) => void;
  /** colors_changed: الشاشة تقرأ من جديد فتصل الألوان الحاليّة. */
  onReread: () => void;
}) {
  const id = useId();
  const [basis, setBasis] = useState<StoreColors>(colors);
  const [draft, setDraft] = useState({ auto: colors.auto, low: colors.low, out: colors.out });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [changed, setChanged] = useState(false);
  // قراءة بنسخة غير التي بُنيت عليها النافذة: الألوان الجديدة تُعرض وتصير الأساس (ضبط حالة من حالة أثناء الرسم بشرط يتوقّف).
  if (colors.version !== basis.version) {
    setBasis(colors);
    setDraft({ auto: colors.auto, low: colors.low, out: colors.out });
    setChanged(true);
    setWaiting(false);
  }
  const dirty = draft.auto !== basis.auto || draft.low !== basis.low || draft.out !== basis.out;
  const locked = busy || waiting;

  const save = async () => {
    if (locked || (!dirty && !unknown)) return;
    setBusy(true);
    setFailure(null);
    setChanged(false);
    try {
      const saved = await setStoreColors(draft.auto, draft.low, draft.out, basis.version);
      setUnknown(false);
      setBusy(false);
      onSaved(saved);
    } catch (problem) {
      setBusy(false);
      if (problem instanceof RejectedError) {
        setUnknown(false);
        setFailure(problem.hint ?? describeError(problem, 'write').title);
        if (problem.code === 'colors_changed') {
          setWaiting(true);
          onReread();
        }
      } else {
        setUnknown(true);
        setFailure(t('colors.unknown', 'لا نعرف إن حُفظت الألوان: أعد المحاولة، ولن يُكتب شيء مرّتين.'));
      }
    }
  };

  return (
    <Dialog
      open
      onClose={() => onClose(unknown)}
      dirty={dirty || unknown}
      locked={busy}
      title={t('colors.title', 'ألوان الرصيد')}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onClose(unknown)} disabled={busy} data-action="colors-cancel">
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button onClick={() => void save()} busy={busy} disabled={locked || (!dirty && !unknown)} data-action={unknown ? 'colors-retry' : 'colors-save'}>
            {unknown ? t('colors.retry', 'أعد المحاولة') : t('colors.save', 'احفظ الألوان')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5" data-action="colors-dialog">
        {failure ? <Notice tone={unknown ? 'warning' : 'danger'} title={failure} /> : null}
        {changed ? (
          <p role="status" className="text-sm text-warn-700 dark:text-warn-300" data-action="colors-changed">
            {t('colors.changed', 'هذه ألوان الرصيد الآن كما حفظها جهاز آخر. اختر ثمّ احفظ.')}
          </p>
        ) : null}
        {waiting && failed ? (
          <Notice
            tone="warning"
            title={t('colors.reread_failed', 'تعذّرت قراءة ألوان الرصيد الحاليّة، فلا حفظ قبل أن تُقرأ.')}
            action={
              <Button variant="secondary" size="sm" onClick={onReread} data-action="colors-reread">
                {t('dayb.reread', 'أعد القراءة')}
              </Button>
            }
          />
        ) : waiting ? (
          <p role="status" className="text-sm text-ink-muted" data-action="colors-reading">
            {t('colors.reading', 'جارٍ قراءة ألوان الرصيد الحاليّة…')}
          </p>
        ) : null}
        <Switch
          id={`${id}-auto`}
          label={t('colors.auto', 'لوّن تلقائيّاً')}
          description={t('colors.auto.hint', 'المادّة التي رصيدها صفر تتلوّن بلون النفاد، والتي وصلت حدّ قلّتها أو أقلّ بلون القلّة. حدّ كلّ مادّة من زرّ لونها.')}
          checked={draft.auto}
          onChange={(auto) => (locked ? undefined : setDraft({ ...draft, auto }))}
        />
        <Palette
          label={t('colors.low', 'لون «{state}»', { state: stateWord('low') })}
          value={draft.low}
          name="low"
          disabled={locked}
          onPick={(low) => setDraft({ ...draft, low })}
        />
        <Palette
          label={t('colors.out', 'لون «{state}»', { state: stateWord('out') })}
          value={draft.out}
          name="out"
          disabled={locked}
          onPick={(out) => setDraft({ ...draft, out })}
        />
        <p className="text-sm text-ink-muted">{t('colors.manual_wins', 'اللون الذي تضعه باليد على مادّة يغلب اللون التلقائيّ.')}</p>
      </div>
    </Dialog>
  );
}
