import { Building2, Minus, Monitor, Moon, Plus, Sun } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { InstallGuide } from '../../components/shell/InstallGuide';
import { Button, IconButton } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Switch } from '../../components/ui/Switch';
import { displayStore, SCALE_MAX, SCALE_MIN, SCALE_STEP, updateDisplay, type ThemeChoice } from '../../lib/display';
import { fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { detectPlatform, installStore } from '../../lib/pwa/install';
import { ensurePersisted, persistStore, type PersistState } from '../../lib/pwa/persist';
import { updateStore } from '../../lib/pwa/update';
import { useStore } from '../../lib/store';

/** «نزّل التطبيق» بس للمفتوح بالمتصفّح: المنزّل ما ينطلب منه شي صار. */
function persistLabel(state: PersistState, installed: boolean): string {
  switch (state) {
    case 'persisted':
      return t('settings.persist.yes', 'محفوظ: لن يمسحه المتصفّح من تلقاء نفسه');
    case 'not_persisted':
      return installed
        ? t('settings.persist.no.installed', 'غير مضمون: قد يمسحه المتصفّح. اطلب الحفظ الدائم مرّة أخرى')
        : t('settings.persist.no', 'غير مضمون: قد يمسحه المتصفّح. ثبّت التطبيق ليُحفظ');
    case 'error':
      return installed
        ? t('settings.persist.error.installed', 'فشل طلب الحفظ الدائم، فهو غير مضمون. اطلبه مرّة أخرى')
        : t('settings.persist.error', 'فشل طلب الحفظ الدائم، فهو غير مضمون. ثبّت التطبيق ليُحفظ');
    case 'unsupported':
      return installed
        ? t('settings.persist.unsupported', 'المتصفّح لا يدعم طلب الحفظ الدائم')
        : t('settings.persist.unsupported.tab', 'المتصفّح لا يدعم طلب الحفظ الدائم، فقد يمسحه. ثبّت التطبيق ليُحفظ');
    case 'unknown':
      return t('settings.persist.unknown', 'غير معروف بعد');
  }
}

function InfoRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd dir={ltr ? 'ltr' : undefined} className={`font-medium ${ltr ? 'text-end tabular-nums' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

export default function SettingsPage() {
  const display = useStore(displayStore);
  const { offlineReady } = useStore(updateStore);
  const persist = useStore(persistStore);
  const install = useStore(installStore);
  const [guideOpen, setGuideOpen] = useState(false);
  // التبويب اللي انقبل منه التثبيت منزّل هم، بس بعده بالمتصفّح.
  const installed = install.standalone || install.installed;

  const themeOptions = [
    { value: 'system' as ThemeChoice, label: t('settings.theme.system', 'حسب الجهاز'), icon: Monitor },
    { value: 'light' as ThemeChoice, label: t('settings.theme.light', 'فاتح'), icon: Sun },
    { value: 'dark' as ThemeChoice, label: t('settings.theme.dark', 'داكن'), icon: Moon },
  ];

  const setScale = (scale: number) => updateDisplay({ scale });
  // من المخزن مو من الرسم: ضغطتان سريعتان قبل إعادة الرسم كانت تحسبان من نفس القيمة.
  const stepScale = (direction: 1 | -1) => setScale(displayStore.get().scale + direction * SCALE_STEP);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('settings.title', 'الإعدادات')} subtitle={t('settings.subtitle', 'إعدادات هذا الجهاز فقط، ولا تؤثّر في بقية الأجهزة.')} />
      <Link to="/settings/org" className="card flex items-center justify-between gap-3 p-5 hover:bg-surface-2" data-action="open-org-settings">
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{t('org.title', 'إعدادات المنشأة')}</span>
          <span className="text-sm text-ink-muted">{t('settings.org.detail', 'لكل أجهزة المنشأة: يوم تشغيل الوحدات، والمواقع والمخازن، وأحجام التعبئة، والتصنيفات.')}</span>
        </span>
        <Building2 aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
      </Link>

      <section className="card flex flex-col gap-6 p-5">
        <h2 className="font-semibold">{t('settings.display', 'العرض')}</h2>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('settings.theme', 'المظهر')}</span>
          <Segmented label={t('settings.theme', 'المظهر')} options={themeOptions} value={display.theme} onChange={(theme) => updateDisplay({ theme })} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="ui-scale" className="text-sm font-medium">
              {t('settings.scale', 'حجم الواجهة')}
            </label>
            <span dir="ltr" className="text-sm font-semibold tabular-nums">
              {fmtInt(display.scale)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <IconButton label={t('settings.scale.smaller', 'صغّر')} onClick={() => stepScale(-1)} disabled={display.scale <= SCALE_MIN}>
              <Minus aria-hidden="true" className="size-5" />
            </IconButton>
            {/* يتبع اتجاه الصفحة (بلا dir="ltr"): الأكبر يمّ «كبّر» والأصغر يمّ «صغّر». */}
            <input
              id="ui-scale"
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={SCALE_STEP}
              value={display.scale}
              onChange={(event) => setScale(Number(event.target.value))}
              className="h-11 min-w-0 flex-1 accent-brand-600"
            />
            <IconButton label={t('settings.scale.bigger', 'كبّر')} onClick={() => stepScale(1)} disabled={display.scale >= SCALE_MAX}>
              <Plus aria-hidden="true" className="size-5" />
            </IconButton>
          </div>
        </div>
        <Switch
          id="clarity"
          label={t('settings.clarity', 'وضع الوضوح')}
          description={t('settings.clarity.detail', 'يُغمِّق النصّ الرمادي للشاشات الضعيفة وتحت أشعّة الشمس.')}
          checked={display.clarity}
          onChange={(clarity) => updateDisplay({ clarity })}
        />
        <Switch
          id="sound"
          label={t('settings.sound', 'الأصوات')}
          description={t('settings.sound.detail', 'نقرة لكل ضغطة، ونغمة للحفظ وللرفض.')}
          checked={display.sound}
          onChange={(sound) => updateDisplay({ sound })}
        />
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="font-semibold">{t('settings.app', 'التطبيق')}</h2>
        <dl className="flex flex-col gap-3">
          <InfoRow label={t('settings.version', 'النسخة')} value={__APP_VERSION__} ltr />
          <InfoRow
            label={t('settings.installed', 'مثبّت كتطبيق')}
            value={
              install.standalone
                ? t('settings.yes', 'نعم')
                : install.installed
                  ? t('settings.installed.tab', 'نعم، لكن هذا تبويب المتصفّح: افتحه من الأيقونة')
                  : t('settings.no', 'لا، مفتوح في المتصفّح')
            }
          />
          <InfoRow
            label={t('settings.offline_ready', 'العمل دون إنترنت')}
            value={offlineReady ? t('settings.offline_ready.yes', 'جاهز') : t('settings.offline_ready.no', 'غير جاهز بعد — أبقِه مفتوحاً على الإنترنت قليلاً')}
          />
          <InfoRow label={t('settings.persist', 'تخزين الجهاز')} value={persistLabel(persist, installed)} />
        </dl>
        <div className="flex flex-wrap gap-2">
          {persist === 'not_persisted' || persist === 'error' ? (
            <Button variant="secondary" size="sm" onClick={() => void ensurePersisted()}>
              {t('settings.persist.ask', 'اطلب الحفظ الدائم')}
            </Button>
          ) : null}
          {installed ? null : (
            <Button variant="secondary" size="sm" onClick={() => setGuideOpen(true)}>
              {t('settings.install_guide', 'كيف أثبّت التطبيق؟')}
            </Button>
          )}
        </div>
      </section>
      <InstallGuide open={guideOpen} platform={detectPlatform()} pendingRounds={0} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
