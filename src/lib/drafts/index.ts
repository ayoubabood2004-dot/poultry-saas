import { openDatabase, requestResult, transact } from '../idb';

// مسوّدات الجهاز (الخطّة WP4، FOUNDATION ١٤٢، X-05): مستند يتكتب بلا نت ينحفظ بالجهاز مختوماً بـ(المستخدم، المنشأة المؤكَّدة)،
// وينعرض لكاتبه بس وبمنشأته بس (GT-29: مسوّدة منشأة أ ما تبين والمنشأة المؤكَّدة ب). وما يصير مسوّدة بالخادم إلا بفعل صريح
// («ارفع») بعد ما my_workspace() يؤكّد نفس المنشأة. الترحيل يحتاج الشبكة دائماً؛ الطابور (outbox) للجولة بس (FOUNDATION ٢٠١).
// ملف كسول: شاشات المخزون تستورده، فما يدخل حزمة الإقلاع.

const DB_NAME = 'poultry-drafts';
const STORE = 'drafts';

export type DeviceDraftKind = 'transfer' | 'opening';

/** الختم: صاحب المسوّدة ومنشأته المؤكَّدة لحظة الحفظ. */
export interface DraftStamp {
  userId: string;
  orgId: string;
}

export interface DeviceDraft<P = unknown> extends DraftStamp {
  id: string;
  kind: DeviceDraftKind;
  /** وصف قصير للرفّ («تحويل من المخزن العام إلى …»). */
  title: string;
  /** وقت الحفظ بالجهاز (للترتيب بس). */
  savedAt: number;
  payload: P;
}

/** المسوّدات اللي تخصّ هذا الختم بس: نفس المستخدم ونفس المنشأة. غيرها ما ينعرض ولا ينرفع. */
export function visibleDrafts<P>(drafts: readonly DeviceDraft<P>[], stamp: DraftStamp): DeviceDraft<P>[] {
  return drafts.filter((draft) => draft.userId === stamp.userId && draft.orgId === stamp.orgId).sort((a, b) => b.savedAt - a.savedAt);
}

export class DraftOrgMismatchError extends Error {
  constructor() {
    super('draft_org_mismatch');
    this.name = 'DraftOrgMismatchError';
  }
}

/** قبل الرفع: الخادم أكّد نفس المستخدم ونفس المنشأة اللي انختمت بيها المسوّدة، وإلا ترمي (ما ترتفع لمنشأة ثانية). */
export function assertSameStamp(draft: DraftStamp, confirmed: DraftStamp | null): void {
  if (!confirmed || confirmed.userId !== draft.userId || confirmed.orgId !== draft.orgId) throw new DraftOrgMismatchError();
}

function open(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, 1, (db) => {
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
  });
}

export async function saveDeviceDraft<P>(stamp: DraftStamp, draft: { id?: string; kind: DeviceDraftKind; title: string; payload: P }): Promise<DeviceDraft<P>> {
  const record: DeviceDraft<P> = { ...stamp, id: draft.id ?? crypto.randomUUID(), kind: draft.kind, title: draft.title, savedAt: Date.now(), payload: draft.payload };
  const db = await open();
  try {
    await transact(db, STORE, 'readwrite', async (tx) => {
      await requestResult(tx.objectStore(STORE).put(record));
      return true;
    });
  } finally {
    db.close();
  }
  return record;
}

/** مسوّدات الختم بس (الأحدث أوّلاً). */
export async function listDeviceDrafts<P = unknown>(stamp: DraftStamp, kind: DeviceDraftKind): Promise<DeviceDraft<P>[]> {
  const db = await open();
  try {
    const all = await transact(db, STORE, 'readonly', (tx) => requestResult(tx.objectStore(STORE).getAll() as IDBRequest<DeviceDraft<P>[]>));
    return visibleDrafts(all, stamp).filter((draft) => draft.kind === kind);
  } finally {
    db.close();
  }
}

export async function removeDeviceDraft(id: string): Promise<void> {
  const db = await open();
  try {
    await transact(db, STORE, 'readwrite', async (tx) => {
      await requestResult(tx.objectStore(STORE).delete(id));
      return true;
    });
  } finally {
    db.close();
  }
}
