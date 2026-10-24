import { useEffect, useId } from 'react';
import { createStore } from '../store';

// نموذج معدّل = نافذة «وسخة»: التحديث ما يتطبّق عليها، والتعافي ما يعيد تحميلها، لحد ما تنحفظ.
// بـdoctorVet إعادة تحميل بنص فاتورة شراء مسحت سطورها.

const dirtyForms = new Set<string>();

/** صحيح إذا أي نموذج بهاي النافذة معدّل وما انحفظ. */
export const dirtyStore = createStore(false);

function sync(): void {
  dirtyStore.set(dirtyForms.size > 0);
}

export function useDirtyForm(dirty: boolean): void {
  const id = useId();
  useEffect(() => {
    if (!dirty) return;
    dirtyForms.add(id);
    sync();
    return () => {
      dirtyForms.delete(id);
      sync();
    };
  }, [dirty, id]);
}

export function isWindowDirty(): boolean {
  return dirtyStore.get();
}

/** إغلاق التبويب أو تحديثه بنموذج معدّل يسأل المتصفّح أوّلاً. */
export function initDirtyGuard(): void {
  window.addEventListener('beforeunload', (event) => {
    if (isWindowDirty()) event.preventDefault();
  });
}
