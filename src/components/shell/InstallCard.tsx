import { Download, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../lib/i18n';
import { detectPlatform, installStore, promptInstall } from '../../lib/pwa/install';
import { persistStore } from '../../lib/pwa/persist';
import { useStore } from '../../lib/store';
import { Button } from '../ui/Button';
import { InstallGuide } from './InstallGuide';

// الزرّ يختفي لما التطبيق مفتوح مثبّت. بلا حدث تثبيت (فايرفوكس، الآيفون، أو كروم قبل ٣٠ ثانية)
// الزرّ يبقى ويفتح الشرح المصوّر. والتبويب اللي انقبل منه التثبيت يكول افتحه من الأيقونة، مو «نزّله».

function CardIcon() {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
      <Smartphone aria-hidden="true" className="size-6" />
    </span>
  );
}

export function InstallCard() {
  const install = useStore(installStore);
  const persist = useStore(persistStore);
  const [guideOpen, setGuideOpen] = useState(false);
  if (install.standalone) return null;

  if (install.installed) {
    return (
      <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <CardIcon />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('install.installed.title', 'التطبيق مثبّت — افتحه من أيقونته')}</h2>
          <p className="text-sm text-ink-muted">
            {t('install.installed.detail', 'الأيقونة على الشاشة الرئيسية تفتحه كتطبيق، والجولة تعمل فيه دون إنترنت. هذا التبويب لا يزال في المتصفّح.')}
          </p>
        </div>
      </section>
    );
  }

  const onInstall = async () => {
    if (install.canPrompt && (await promptInstall()) !== 'unavailable') return;
    setGuideOpen(true);
  };

  // كل حالة غير «محفوظ» تعني التخزين ممكن ينمسح (و«ما انعرف بعد» بس قبل أوّل جواب).
  const atRisk = persist !== 'persisted' && persist !== 'unknown';

  return (
    <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <CardIcon />
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">
          {atRisk ? t('install.keep_rounds', 'ثبّت التطبيق حتى لا تضيع جولاتك') : t('install.title', 'ثبّت التطبيق على الهاتف')}
        </h2>
        <p className="text-sm text-ink-muted">
          {t('install.why', 'أيقونة على الشاشة تفتح النظام مباشرةً، والجولة اليومية تعمل دون إنترنت.')}
        </p>
      </div>
      <Button onClick={() => void onInstall()} icon={<Download aria-hidden="true" className="size-5" />} data-action="install-app">
        {t('install.button', 'ثبّت التطبيق')}
      </Button>
      {/* الجولات تدخل الطابور بالمرحلة 3؛ لحد ذاك ماكو جولات منتظرة بهذا التبويب. */}
      <InstallGuide open={guideOpen} platform={detectPlatform()} pendingRounds={0} onClose={() => setGuideOpen(false)} />
    </section>
  );
}
