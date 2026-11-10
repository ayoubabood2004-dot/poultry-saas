import { t } from '../../../lib/i18n';
import { LEVELS, tintOf } from './calendar';

/** دليل الألوان: «بلا إنتاج» بلون السطح، ثمّ «أقلّ» والدرجات الأربع و«أكثر»، وملاحظة اختيارية (وحدة الأرقام في خلايا الأيام). */
export function Legend({ note }: { note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted" data-action="legend">
      <span className="inline-flex items-center gap-1.5">
        <span className="block size-4 rounded border border-line bg-surface-2" aria-hidden="true" data-action="legend-swatch" data-level="0" />
        {t('millrep.legend.none', 'بلا إنتاج')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {t('millrep.legend.less', 'أقلّ')}
        {LEVELS.map((level) => (
          <span key={level} className="block size-4 rounded border border-line" style={{ backgroundColor: tintOf(level) }} aria-hidden="true" data-action="legend-swatch" data-level={level} />
        ))}
        {t('millrep.legend.more', 'أكثر')}
      </span>
      {note ? <span>{note}</span> : null}
    </div>
  );
}
