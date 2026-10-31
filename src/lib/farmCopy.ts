import { openDatabase, requestResult, transact } from './idb';
import type { Stamp } from './outbox';
import { markFarmCopy, stampKey } from './roundUploads';

// نسخة الجهاز من قراءة الحقول (FOUNDATION ٢١٧–٢١٨): آخر جواب flocks_overview ناجح لكل (مستخدم، منشأة)، والتحديث يستبدلها ما يدمجها.
// الجولة تنفتح منها بلا نت، والرأس يقول «غير جاهز دون اتصال» لعامل القاعة لحد ما تنحفظ. كل قراءة ناجحة تحفظها (الرئيسية ويّاها)،
// مو شاشات الحقول بس: عامل فتح الرئيسية بالنت وطلع للقاعة كانت جولته ما تنفتح.

const CACHE_DB = 'poultry-farm';
const CACHE_STORE = 'overview';

export function openFarmCache(name: string = CACHE_DB): Promise<IDBDatabase> {
  return openDatabase(name, 1, (db, oldVersion) => {
    if (oldVersion < 1) db.createObjectStore(CACHE_STORE);
  });
}

export interface OverviewCopy {
  json: unknown;
  at: number;
}

export async function keepOverview(stamp: Stamp, json: unknown, at: number): Promise<void> {
  const db = await openFarmCache();
  await transact(db, CACHE_STORE, 'readwrite', async (tx) => {
    await requestResult(tx.objectStore(CACHE_STORE).put({ json, at }, stampKey(stamp)));
    return true;
  });
  markFarmCopy(stampKey(stamp));
}

export async function savedOverview(stamp: Stamp): Promise<OverviewCopy | null> {
  const db = await openFarmCache();
  const saved = await transact(db, CACHE_STORE, 'readonly', (tx) => requestResult(tx.objectStore(CACHE_STORE).get(stampKey(stamp)) as IDBRequest<OverviewCopy | undefined>));
  if (saved) markFarmCopy(stampKey(stamp));
  return saved ?? null;
}

/** بالجهاز نسخة من قراءة الحقول لهذا المستخدم والمنشأة (وتنعلّم بالمخزن حتى الرأس يعرف). */
export async function hasOverviewCopy(stamp: Stamp): Promise<boolean> {
  return (await savedOverview(stamp)) !== null;
}
