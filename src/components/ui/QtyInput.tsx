import type { Decimal } from '../../domain/decimal';
import { toWesternDigits } from '../../domain/normalize';
import { parseQty, toBase, type BaseUnit } from '../../domain/units';
import { fmtCounted, fmtQty, type CountedForms } from '../../lib/format';
import { t } from '../../lib/i18n';
import { sound } from '../../lib/sound';
import { Field } from './Field';

// الوحدة جزء من الحقل (كيس / كغم / طن)، والتحويل ينعرض حيّاً تحته («47 كيس = 2,350 كغم»).
// الأرقام الشرقية و«٫» تتبدّل لغربية بكل حقل.

/** فاصلة أو نقطة (وأختيهن العربيات ٬ ٫): «0,5» و«٠٬٥» كانت تنقرا 5 بلا كلمة، فالقراءة تنعرض دائماً. */
const SEPARATOR = /[,.\u{66B}\u{66C}]/u;

export interface QtyUnitOption {
  id: string;
  /** «كيس 50 كغم»، «طن»، «طبقة». */
  label: string;
  /** المعامل لوحدة الأساس، ينحفظ على السطر لحظة الإدخال. */
  factor: Decimal;
  /** صيغ اسم الوحدة بعد رقم («5 أكياس»، «كيسان»). */
  forms?: CountedForms;
  /** وحدة الأساس باسم وحدة عدّ المادّة («قنينة» بدل «قطعة»): التحويل يُقرأ بها. */
  piece?: boolean;
}

export interface QtyValue {
  text: string;
  unitId: string;
}

export interface QtyInputProps {
  id: string;
  label: string;
  base: BaseUnit;
  /** اسم القطعة للمعدود: «بيضة»، «فرخ». */
  pieceLabel?: string;
  /** صيغ اسم القطعة بعد رقم. */
  pieceForms?: CountedForms;
  units: readonly QtyUnitOption[];
  value: QtyValue;
  onChange: (next: QtyValue) => void;
  hint?: string;
  error?: string | null;
}

export function QtyInput({ id, label, base, pieceLabel: pieceProp, pieceForms, units, value, onChange, hint, error }: QtyInputProps) {
  const pieceLabel = pieceProp ?? units.find((option) => option.piece)?.label;
  // ماكو وحدة افتراضية بالعرض: units[0] كان يبين مختاراً والقيمة تحمل unitId ثاني (أو فارغ)،
  // فالشاشة تكول 100 كغم والأب يحفظ 2. اللي ينعرض مختاراً هو اللي بالقيمة بس.
  const unit = units.find((option) => option.id === value.unitId) ?? null;
  const filled = value.text.trim() !== '';
  const qty = filled ? parseQty(value.text) : null;

  let problem: string | null = null;
  let conversion: string | null = null;
  if (filled && qty === null) {
    problem = t('qty.invalid_format', 'اكتب رقماً بنقطة عشرية (0.5) حتى ثلاث مراتب، والفاصلة بين كل ثلاثة أرقام فقط (1,250)');
  } else if (filled && !unit) {
    problem = t('qty.pick_unit', 'اختر الوحدة');
  } else if (qty !== null && unit) {
    const converted = toBase(qty, unit.factor, base);
    if (!converted.ok) problem = t('qty.pieces_whole', 'يجب أن يكون عدد القطع صحيحاً');
    else {
      const shown = fmtQty(converted.qty, base, { pieceLabel, pieceForms });
      const inBase = shown.sub ?? shown.main;
      if (!(unit.factor.units === 1n && unit.factor.scale === 0)) conversion = `${fmtCounted(qty, unit.label, unit.forms)} = ${inBase}`;
      // بوحدة الأساس نفسها: أي فاصلة بالنصّ تنعاد مقروءة («= 1,234.5 كغم») حتى «0,5» ما تمرّ 5 بصمت.
      else if (SEPARATOR.test(value.text)) conversion = `= ${inBase}`;
    }
  }

  // وحدة وحدة بس تنعرض كلمة ثابتة إذا هي اللي بالقيمة؛ وإلا تنعرض للاختيار حتى ما يعلك الحقل بلا حلّ.
  const pickable = units.length > 1 || (units.length === 1 && !unit);

  return (
    <Field id={id} label={label} error={error ?? problem} hint={conversion ?? hint}>
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          dir="ltr"
          className="input min-w-0 flex-1 text-end tabular-nums"
          value={value.text}
          aria-invalid={problem !== null || Boolean(error) || undefined}
          onChange={(event) => onChange({ ...value, text: toWesternDigits(event.target.value) })}
        />
        {pickable ? (
          <div role="radiogroup" aria-label={t('qty.unit', 'الوحدة')} className="flex shrink-0 gap-1 rounded-2xl border border-line bg-surface-2 p-1">
            {units.map((option) => {
              const selected = option.id === unit?.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    sound.click();
                    onChange({ ...value, unitId: option.id });
                  }}
                  className={`rounded-xl px-3 text-sm font-medium transition-colors ${
                    selected ? 'bg-surface-1 text-ink shadow-card' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : unit ? (
          <span className="flex shrink-0 items-center px-2 text-sm text-ink-muted">{unit.label}</span>
        ) : null}
      </div>
    </Field>
  );
}
