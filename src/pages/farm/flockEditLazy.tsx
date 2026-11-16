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
