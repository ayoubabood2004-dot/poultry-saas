import { createStore } from '../store';

// التخزين ما ينمسح من وراك: المتصفّح يقرّر persist() بلا سؤال وبمعايير أهمها التثبيت، والرفض ينعاد تقييمه،
// فينسأل بكل إقلاع (main.tsx) وبكل حفظ جولة للطابور (saveRound بـlib/outbox/round.ts، والحارس يمنع enqueue
// مباشرةً). سفاري (التبويب) يمسح كل تخزين الموقع بعد ٧ أيام بلا تفاعل،
// والتطبيق المضاف للشاشة الرئيسية مستثنى.

// كل حالة غير 'persisted' تعني «ممكن ينمسح»: 'unsupported' سفاري قبل 15.2 بلا navigator.storage،
// و'error' سؤال رمى (نافذة خاصّة، خطأ عابر) فينعاد طلبه.
export type PersistState = 'unknown' | 'persisted' | 'not_persisted' | 'unsupported' | 'error';

export const persistStore = createStore<PersistState>('unknown');

export async function ensurePersisted(): Promise<PersistState> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persisted) {
    persistStore.set('unsupported');
    return 'unsupported';
  }
  try {
    let persisted = await storage.persisted();
    if (!persisted && storage.persist) persisted = await storage.persist();
    const state: PersistState = persisted ? 'persisted' : 'not_persisted';
    persistStore.set(state);
    return state;
  } catch {
    persistStore.set('error');
    return 'error';
  }
}
