import { createStore } from './store';

/** حالة الشبكة كما يشوفها المتصفّح. «متّصل» ما يضمن وصول الخادم؛ كل طلب بمهلته. */
export const onlineStore = createStore<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);

export function initOnline(): void {
  window.addEventListener('online', () => onlineStore.set(true));
  window.addEventListener('offline', () => onlineStore.set(false));
}
