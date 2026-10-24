import { TriangleAlert } from 'lucide-react';
import type { Fils, Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { fmtQty, type CountedForms } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import { MoneyText } from './MoneyText';

// قبل أي ترحيل: من أي دفعات راح ينسحب وبأي كمية، وشنو ينقص، والكلفة لدور يشوفها بس.
// المعاينة من دالّة بالخادم بنفس قناع الكلفة، والموافقة بمعرّف السطر مو «نعم» عامة:
// معاينة تختلف عن الترحيل بفلس تخلّي المدير يوافق على رقم وينحفظ غيره.

export interface PreviewDraw {
  lotId: string;
  /** «دفعة 1/10» أو رقم مستند الاستلام. */
  lotLabel: string;
  qty: Milli;
  /** null لدور ما يشوف الكلفة: الخادم ما يرجّعها أصلاً. */
  value: Fils | null;
}

export interface PreviewLine {
  lineId: string;
  itemName: string;
  unit: BaseUnit;
  pieceLabel?: string;
  /** صيغ اسم القطعة بعد رقم («5 بيضات»، «بيضتان»). */
  pieceForms?: CountedForms;
  requested: Milli;
  draws: readonly PreviewDraw[];
  /** الناقص عن المطلوب؛ صفر = يكفي. */
  shortage: Milli;
}

export interface PostPreviewProps {
  lines: readonly PreviewLine[];
  approved: ReadonlySet<string>;
  onToggle: (lineId: string, approved: boolean) => void;
}

export function previewReady(lines: readonly PreviewLine[], approved: ReadonlySet<string>): boolean {
  return lines.length > 0 && lines.every((line) => line.shortage === 0n && approved.has(line.lineId));
}

export function PostPreview({ lines, approved, onToggle }: PostPreviewProps) {
  return (
    <ul className="flex flex-col gap-3">
      {lines.map((line) => {
        const options = { pieceLabel: line.pieceLabel, pieceForms: line.pieceForms };
        const checkboxId = `preview-${line.lineId}`;
        return (
          <li key={line.lineId} className="rounded-2xl border border-line bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold">{line.itemName}</div>
              <div className="text-sm text-ink-muted tabular-nums">{fmtQty(line.requested, line.unit, options).main}</div>
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {line.draws.map((draw) => (
                <li key={draw.lotId} className="flex items-center justify-between gap-3">
                  <span className="text-ink-muted">{draw.lotLabel}</span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span>{fmtQty(draw.qty, line.unit, options).main}</span>
                    {draw.value !== null ? <MoneyText amount={draw.value} className="text-ink-muted" /> : null}
                  </span>
                </li>
              ))}
            </ul>
            {line.shortage > 0n ? (
              <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-medium text-danger-700 dark:text-danger-200">
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                <Trans
                  k="preview.shortage"
                  text="ينقص <b>{qty}</b>: سجّل الاستلام أو الجرد قبل الترحيل"
                  vars={{ qty: fmtQty(line.shortage, line.unit, options).main }}
                  tags={{ b: (chunk) => <b className="tabular-nums">{chunk}</b> }}
                />
              </p>
            ) : (
              <label htmlFor={checkboxId} className="mt-3 flex items-center gap-2 text-sm">
                <input
                  id={checkboxId}
                  type="checkbox"
                  className="size-5 accent-brand-600"
                  checked={approved.has(line.lineId)}
                  onChange={(event) => onToggle(line.lineId, event.target.checked)}
                  data-action="approve-line"
                />
                {t('preview.approve_line', 'اطّلعت على السحب من هذه الدفعات وأوافق عليه')}
              </label>
            )}
          </li>
        );
      })}
    </ul>
  );
}
