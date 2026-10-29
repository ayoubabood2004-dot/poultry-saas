import { TriangleAlert } from 'lucide-react';
import type { Fils, Milli } from '../../domain/money';
import type { BaseUnit } from '../../domain/units';
import { fmtDay, fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import { MoneyText } from './MoneyText';

// معاينة الترحيل بنوعها الثاني (الخطّة WP4 «UI blocks»): مستند يخلق دفعات (الافتتاح، وبحزمها الاستلام وزيادة الجرد) مو يسحب
// منها. كل سطر = دفعة راح تنخلق بكميتها (وقيمتها لدور الكلفة بس، الخادم يخفيها لغيره) وانتهائها، ومشكلة السطر من الخادم نفسها
// اللي يرفض بيها الترحيل (FOUNDATION ٧٧٠)، والموافقة بمعرّف السطر.

export interface CreatedLot {
  lineId: string;
  itemName: string;
  unit: BaseUnit;
  qty: Milli;
  expiryOn: string | null;
  /** null لدور ما يشوف الكلفة. */
  value: Fils | null;
  /** جملة الرفض إذا السطر ما ينرحّل. */
  problem: string | null;
}

export function creationReady(lots: readonly CreatedLot[], approved: ReadonlySet<string>): boolean {
  return lots.length > 0 && lots.every((lot) => lot.problem === null && approved.has(lot.lineId));
}

export function LotsPreview({ lots, approved, onToggle }: { lots: readonly CreatedLot[]; approved: ReadonlySet<string>; onToggle: (lineId: string, approved: boolean) => void }) {
  return (
    <ul className="flex flex-col gap-3">
      {lots.map((lot) => {
        const checkboxId = `create-${lot.lineId}`;
        return (
          <li key={lot.lineId} className="rounded-2xl border border-line bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold">{lot.itemName}</div>
              <div className="flex items-center gap-3 text-sm tabular-nums">
                <span>{fmtQty(lot.qty, lot.unit).main}</span>
                {lot.value !== null ? <MoneyText amount={lot.value} className="text-ink-muted" /> : null}
              </div>
            </div>
            {lot.expiryOn ? <p className="mt-1 text-sm text-ink-muted">{t('lots_preview.expiry', 'ينتهي {day}', { day: fmtDay(lot.expiryOn) })}</p> : null}
            {lot.problem ? (
              <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-medium text-danger-700 dark:text-danger-200">
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                {lot.problem}
              </p>
            ) : (
              <label htmlFor={checkboxId} className="mt-3 flex items-center gap-2 text-sm">
                <input
                  id={checkboxId}
                  type="checkbox"
                  className="size-5 accent-brand-600"
                  checked={approved.has(lot.lineId)}
                  onChange={(event) => onToggle(lot.lineId, event.target.checked)}
                  data-action="approve-lot"
                />
                {t('lots_preview.approve', 'راجعت هذه الدفعة وأوافق على إنشائها')}
              </label>
            )}
          </li>
        );
      })}
    </ul>
  );
}
