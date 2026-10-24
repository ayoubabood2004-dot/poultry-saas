// أغلفة صغيرة لـIndexedDB. داخل المعاملة ما ننتظر غير طلبات IndexedDB نفسها،
// لأن انتظار شي ثاني يخلّي المعاملة تنقفل لحالها بنصّ الشغل.

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('idb_request_failed'));
  });
}

export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion);
    request.onsuccess = () => {
      const db = request.result;
      // نسخة أحدث بتبويب ثاني تريد ترقية القاعدة: نسكّر اتصالنا حتى ما نسدّها. هذا لازم يطلع
      // بالنسخة الحالية، لأن الاتصال القديم هو اللي لازم يتسكّر لمّا تجي الترقية.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('idb_open_failed'));
    // onblocked مو فشل: تبويب قديم بعده ماسك القاعدة، والطلب يكمّل لحاله أوّل ما يتسكّر.
    // الرفض هنا يخلّي الطلب حيّ بلا أحد ينتظره، والاتصال اللي يفتح بعدين يضيع.
  });
}

/** معاملة تنجح كلها أو ما تصير: النتيجة ترجع بعد ما تكتمل المعاملة فعلاً، مو قبل. */
export function transact<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let settled = false;
    let value: { result: T } | null = null;
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      if (value) resolve(value.result);
      else reject(new Error('idb_tx_completed_early'));
    };
    tx.onabort = () => {
      if (settled) return;
      settled = true;
      reject(tx.error ?? new Error('idb_tx_aborted'));
    };
    body(tx).then(
      (result) => {
        value = { result };
      },
      (error: unknown) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
        try {
          tx.abort();
        } catch {
          /* swallow-ok: المعاملة انتهت قبل الإلغاء، والخطأ الأصلي انرمى فوك */
        }
      },
    );
  });
}
