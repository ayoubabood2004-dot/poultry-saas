import type { Workspace } from '../domain/workspace';
import { openDatabase, requestResult, transact } from './idb';

// آخر هويّة أكّدها الخادم لكل مستخدم (FOUNDATION ٢١٧): الإقلاع بلا نت وتوكن منتهٍ يفتح بيها، بشرط إنها لصاحب
// التوكن المحفوظ نفسه. ما ينحفظ بيها سرّ (لا توكن ولا رمز دعوة)، والخروج يمسحها. قاعدة منفصلة عن الطابور،
// حتى ترقيته ما تلمسها.

const DB_NAME = 'poultry-identity';
const DB_VERSION = 1;
const STORE = 'workspaces';

let opening: Promise<IDBDatabase> | null = null;

function database(name: string): Promise<IDBDatabase> {
  if (name !== DB_NAME) {
    return openDatabase(name, DB_VERSION, (db, oldVersion) => upgrade(db, oldVersion));
  }
  opening ??= openDatabase(DB_NAME, DB_VERSION, upgrade).catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) db.createObjectStore(STORE, { keyPath: 'userId' });
}

/** يحفظ الهويّة المؤكّدة. فشل الحفظ ما يوكف الشاشة: الإقلاع بلا نت بس اللي يخسر. */
export async function saveIdentity(workspace: Workspace, name = DB_NAME): Promise<void> {
  try {
    const db = await database(name);
    await transact(db, STORE, 'readwrite', (tx) => requestResult(tx.objectStore(STORE).put(workspace)).then(() => undefined));
  } catch {
    /* swallow-ok: IndexedDB ممنوع أو ممتلئ؛ الهويّة تنأكّد من الخادم بكل إقلاع بالنت */
  }
}

/** هويّة المستخدم المحفوظة، أو null. */
export async function loadIdentity(userId: string, name = DB_NAME): Promise<Workspace | null> {
  let saved: Workspace | undefined;
  try {
    const db = await database(name);
    saved = await transact(db, STORE, 'readonly', (tx) => requestResult(tx.objectStore(STORE).get(userId) as IDBRequest<Workspace | undefined>));
  } catch {
    /* swallow-ok: ماكو قاعدة محلّية = ماكو هويّة محفوظة؛ الإقلاع بلا نت يكول «يحتاج اتصالاً» */
  }
  return saved && saved.userId === userId ? saved : null;
}

export async function forgetIdentity(userId: string, name = DB_NAME): Promise<void> {
  try {
    const db = await database(name);
    await transact(db, STORE, 'readwrite', (tx) => requestResult(tx.objectStore(STORE).delete(userId)).then(() => undefined));
  } catch {
    /* swallow-ok: ماكو قاعدة محلّية يعني ماكو هويّة محفوظة تنمسح */
  }
}
