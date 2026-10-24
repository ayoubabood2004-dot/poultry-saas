import { Check, Dock, Download, Ellipsis, EllipsisVertical, Share, SquarePlus, type LucideIcon } from 'lucide-react';
import { fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { Platform } from '../../lib/pwa/install';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Notice } from '../ui/Notice';

// شرح التثبيت المصوّر حسب الجهاز. بالآيفون ماكو حدث تثبيت: الشرح حسب تخطيط سفاري
// (المضغوط افتراض iOS 26، والسفلي أو العلوي وبالنسخ الأقدم «مشاركة» مباشرةً)، وبالآخر
// «فتح كتطبيق ويب» يبقى شغّال، وإلا تصير إشارة مرجعية تنفتح بسفاري وبتخزينه. سفاري الماك يثبّت
// بـ«إضافة إلى Dock»، وفايرفوكس الحاسبة والمتصفّح داخل التطبيقات ما يثبّتون: نكول افتحه بكروم أو سفاري.

interface Step {
  icon: LucideIcon;
  text: string;
}

function Steps({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map(({ icon: Icon, text }, index) => (
        <li key={text} className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-ink">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <span className="pt-2.5">
            <span className="font-semibold tabular-nums">{fmtInt(index + 1)}. </span>
            {text}
          </span>
        </li>
      ))}
    </ol>
  );
}

function IosWarning() {
  return (
    <Notice tone="warning" title={t('install.ios.warning.title', 'قبل التثبيت على الآيفون')}>
      {t(
        'install.ios.warning.detail',
        'التطبيق المثبّت يطلب تسجيل الدخول من جديد ويحتاج إلى الإنترنت في أوّل دخول، والجولات المحفوظة في تبويب سفاري لا تنتقل إليه.',
      )}
    </Notice>
  );
}

function iosSafariSteps(): Step[] {
  return [
    { icon: Ellipsis, text: t('install.ios.step1', 'اضغط «⋯» بجانب شريط العنوان.') },
    { icon: Share, text: t('install.ios.step2', 'اختر «مشاركة».') },
    {
      icon: SquarePlus,
      text: t(
        'install.ios.step3',
        'اختر «إضافة إلى الشاشة الرئيسية». إن لم تظهر: انزل إلى آخر القائمة، واضغط «تعديل الإجراءات» وأضفها.',
      ),
    },
    { icon: Check, text: t('install.ios.step4', 'أبقِ «فتح كتطبيق ويب» مفعّلاً، واضغط «إضافة».') },
  ];
}

function iosShareSteps(): Step[] {
  return [
    { icon: Share, text: t('install.ios_share.step1', 'اضغط زرّ المشاركة في شريط العنوان.') },
    { icon: SquarePlus, text: t('install.ios_share.step2', 'اختر «إضافة إلى الشاشة الرئيسية».') },
    { icon: Check, text: t('install.ios_share.step3', 'أبقِ «فتح كتطبيق ويب» مفعّلاً، واضغط «إضافة».') },
  ];
}

function androidSteps(): Step[] {
  return [
    { icon: EllipsisVertical, text: t('install.android.step1', 'اضغط «⋮» أعلى المتصفّح.') },
    { icon: Download, text: t('install.android.step2', 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».') },
    { icon: Check, text: t('install.android.step3', 'أكّد «تثبيت». ستظهر الأيقونة على الشاشة.') },
  ];
}

function desktopSteps(): Step[] {
  return [
    { icon: Download, text: t('install.desktop.step1', 'اضغط أيقونة التثبيت في شريط العنوان، أو اختر «تثبيت» من قائمة المتصفّح.') },
    { icon: Check, text: t('install.desktop.step2', 'أكّد «تثبيت». سيُفتح التطبيق في نافذة مستقلّة.') },
  ];
}

function macSafariSteps(): Step[] {
  return [
    { icon: Share, text: t('install.mac_safari.step1', 'من قائمة «ملف» في الأعلى، أو من زرّ المشاركة في الشريط، اختر «إضافة إلى Dock».') },
    { icon: Dock, text: t('install.mac_safari.step2', 'اضغط «إضافة». ستظهر الأيقونة في الـDock، وسيُفتح التطبيق في نافذة مستقلّة.') },
  ];
}

export interface InstallGuideBodyProps {
  platform: Platform;
  /** جولات الداخل اللي ما انرفعت: تنبيه الآيفون ما يطلع إلا والطابور فاضي. */
  pendingRounds: number;
}

/** محتوى الشرح حسب الجهاز، برّا النافذة حتى ينفحص لحاله. */
export function InstallGuideBody({ platform, pendingRounds }: InstallGuideBodyProps) {
  const ios = platform === 'ios-safari' || platform === 'ios-chrome' || platform === 'ios-other';
  // تخزين الآيفون والمتصفّح داخل التطبيقات منفصل عن التطبيق المنزّل: الجولات ما تنتقل.
  if ((ios || platform === 'in-app') && pendingRounds > 0) {
    return (
      <Notice tone="warning" title={t('install.ios.upload_first', 'ارفع جولاتك أولاً، ثم ثبّت التطبيق')}>
        {t('install.ios.upload_first.detail', 'جولات لم تُرفع في هذا التبويب: {n}، ولن تنتقل إلى التطبيق المثبّت.', { n: pendingRounds })}
      </Notice>
    );
  }
  if (platform === 'ios-safari') {
    return (
      <div className="flex flex-col gap-4">
        <IosWarning />
        <Steps steps={iosSafariSteps()} />
        <p className="text-sm text-ink-muted">
          {t('install.ios.other_layout', 'إذا كان شريط سفاري في الأسفل أو الأعلى، أو كانت نسخة iOS أقدم: اضغط «مشاركة» مباشرةً وتابع من الخطوة 3.')}
        </p>
      </div>
    );
  }
  if (ios) {
    return (
      <div className="flex flex-col gap-4">
        <IosWarning />
        <Steps steps={iosShareSteps()} />
      </div>
    );
  }
  if (platform === 'android') {
    return (
      <div className="flex flex-col gap-4">
        <Steps steps={androidSteps()} />
        <p className="text-sm text-ink-muted">{t('install.android.firefox', 'إن لم تجد خيار التثبيت: افتح الرابط في كروم.')}</p>
      </div>
    );
  }
  if (platform === 'desktop-safari') {
    return (
      <div className="flex flex-col gap-4">
        <Steps steps={macSafariSteps()} />
        <p className="text-sm text-ink-muted">
          {t('install.mac_safari.old', 'إن لم تجد «إضافة إلى Dock»: يحتاج الماك إلى macOS 14 أو أحدث، أو افتح الرابط في كروم.')}
        </p>
      </div>
    );
  }
  if (platform === 'desktop-firefox') {
    return (
      <Notice tone="info" title={t('install.firefox_desktop.title', 'فايرفوكس لا يثبّت التطبيق')}>
        {t('install.firefox_desktop.detail', 'افتح الرابط نفسه في كروم أو سفاري، وثبّته من هناك.')}
      </Notice>
    );
  }
  if (platform === 'in-app') {
    return (
      <Notice tone="info" title={t('install.in_app.title', 'هذا متصفّح داخل تطبيق آخر، ولا يمكنه تثبيت التطبيق')}>
        {t('install.in_app.detail', 'اختر «فتح في المتصفّح» من «⋯»، أو انسخ الرابط وافتحه في كروم أو سفاري، وثبّته من هناك.')}
      </Notice>
    );
  }
  return <Steps steps={desktopSteps()} />;
}

export interface InstallGuideProps extends InstallGuideBodyProps {
  open: boolean;
  onClose: () => void;
}

export function InstallGuide({ open, platform, pendingRounds, onClose }: InstallGuideProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('install.guide.title', 'ثبّت التطبيق')}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('install.guide.done', 'حسناً')}
          </Button>
        </div>
      }
    >
      <InstallGuideBody platform={platform} pendingRounds={pendingRounds} />
    </Dialog>
  );
}
