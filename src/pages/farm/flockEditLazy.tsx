import { lazy, Suspense, useState, type ComponentType } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Notice';
import { loadHalls } from '../../lib/hallsChunk';
import { t } from '../../lib/i18n';
import { quietly } from '../../lib/pwa/recovery';
import type { FlockEditDialogProps } from './FlockEditDialog';

// نافذة «عدّل الفوج» (0028، كلمة الزبون 2026-11-15) من حزمة القاعات خارج التثبيت المسبق، كتذكير اللقاحات (pages/farm/shared): جدول الحقل وشاشة
// الفوج في التثبيت المسبق (الجولة بلا نت)، والتعديل والحذف يحتاجان الخادم كلّه، فلا يكبر التثبيت المسبق بما لا يعمل بلا نت. استيراد اختياريّ (quietly):
// فشله بلا نت ليس قشرة قديمة، فالنافذة تقول إنّ التعديل يحتاج اتصالاً بدل أن تختفي؛ واستيراد واحد لكلّ نافذة تُفتح، فرجوع الاتصال يكفيه فتحها ثانية.

/** بلا حزمة القاعات (بلا نت): نافذة تقول السبب، وإغلاقها وحده. */
function NeedsConnection({ hallName, onClose }: FlockEditDialogProps) {
  return (
    <Dialog open onClose={onClose} title={t('farm.flock.edit.title', 'تعديل فوج «{hall}»', { hall: hallName })}>
      <div data-action="flock-edit-offline">
        <Notice tone="info" title={t('farm.flock.edit.offline', 'تعديل الفوج وحذفه يحتاجان اتصالاً بالخادم: أغلق النافذة وافتحها حين يعود الاتصال.')} />
      </div>
    </Dialog>
  );
}

const dialogLazy = () =>
  lazy<ComponentType<FlockEditDialogProps>>(() =>
    quietly(loadHalls).then(
      (halls) => ({ default: halls.FlockEditDialog }),
      () => ({ default: NeedsConnection }),
    ),
  );

/** «عدّل الفوج» لجدول الحقل وشاشة الفوج: النافذة من حزمة القاعات حين تُفتح. */
export function FlockEditDialogLazy(props: FlockEditDialogProps) {
  const [LazyDialog] = useState(dialogLazy);
  return (
    <Suspense fallback={null}>
      <LazyDialog {...props} />
    </Suspense>
  );
}

/** نافذة القاعة أو الفوج الجديد بلا حزمة القاعات (بلا نت): تقول السبب، وإغلاقها وحده. */
function DialogOffline({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title={t('farm.dialog.offline_title', 'يحتاج اتصالاً')}>
      <div data-action="dialog-offline">
        <Notice tone="info" title={t('farm.dialog.offline', 'هذه النافذة تحتاج اتصالاً بالخادم: أغلقها وافتحها حين يعود الاتصال.')} />
      </div>
    </Dialog>
  );
}

/**
 * «أضف قاعة» و«عدّل القاعة» و«افتح فوجاً» في جدول الحقل من حزمة القاعات خارج التثبيت المسبق كـ«عدّل الفوج» (سقف التثبيت المسبق، 0036): كلّها تحتاج
 * الخادم، فلا يُحفظ للفتح بلا نت ما لا يعمل بلا نت؛ وبلا نت نافذة تقول السبب. استيراد واحد لكلّ نافذة تُفتح.
 */
function fromHalls<P extends { onClose: () => void }>(pick: (halls: Awaited<ReturnType<typeof loadHalls>>) => ComponentType<P> | undefined) {
  return function FromHalls(props: P) {
    // lazy يلفّ المكوّن بخصائص ref، فيُعاد إلى ComponentType<P> نفسه (الخصائص كما هي).
    const [Lazy] = useState(
      () => lazy(() => quietly(loadHalls).then((halls) => ({ default: pick(halls) ?? DialogOffline }), () => ({ default: DialogOffline as ComponentType<P> }))) as unknown as ComponentType<P>,
    );
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

export const HallDialogLazy = fromHalls((halls) => halls.HallDialog);
export const OpenFlockDialogLazy = fromHalls((halls) => halls.OpenFlockDialog);
