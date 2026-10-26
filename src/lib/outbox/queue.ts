import { openDatabase, requestResult, transact } from '../idb';
import {
  QUEUEABLE_FUNCTIONS,
  type FlockDayPayload,
  type OpState,
  type OutboxOp,
  type QueueableFunction,
  type ReviewEntry,
  type SendResult,
  type Stamp,
  type Transport,
} from './types';

// قواعد الطابور (قسم «المكدس والبنية» بـdocs/FOUNDATION.md)، وكل وحدة منها حادثة بـdoctorVet:
// - كل عملية مختومة بالمستخدم والمنشأة المؤكّدة وما ترتفع إلا بهويّتها: جهاز تتبدّل عليه الحسابات
//   رفع عمليات عيادة باسم غيرها.
// - الدمج بالجهاز مفتاحه (المستخدم، المنشأة، الفوج، اليوم): دمج بـ(فوج + يوم) بس يطوي جولة عامل بجولة غيره.
// - عملية نتيجتها مجهولة تنحسم بمرجعها أوّلاً، والتالية لنفس المفتاح تاخذ base_version اللي رجعت.
// - رفض الهويّة والاشتراك يخلّيها تنتظر: ما ينحسب محاولة وما يروح لرفّ المراجعة.
// - المرفوض يروح لرفّ مراجعة بالنسختين وما ينحذف أبداً (الحذف بعد عشر محاولات كان سطر كونسول).

const DB_NAME = 'poultry-outbox';
const DB_VERSION = 1;
const OPS = 'ops';
const REVIEW = 'review';
const OPS_BY_OWNER = 'by_owner_created';
const OPS_BY_KEY = 'by_key';
const REVIEW_BY_OWNER = 'by_owner';

/** نافذة ماسكة عملية أكثر من هيج انغلقت أو انسدّت: العملية تنحسم بمرجعها مثل المجهولة. */
export const STALE_CLAIM_MS = 60_000;

export class OutboxError extends Error {
  constructor(readonly code: 'not_queueable' | 'no_identity') {
    super(code);
    this.name = 'OutboxError';
  }
}

/**
 * ترقية القاعدة خطوة لكل نسخة: كل فرع يبني اللي زادته نسخته بس، لأن قاعدة نسخة أقدم بيها مخازنها.
 * النسخة الجاية تضيف `if (oldVersion < 2)` تحت هذا. مصدّرة حتى الفحص يشغّلها كترقية نسخة أعلى.
 */
export function upgradeOutbox(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    const ops = db.createObjectStore(OPS, { keyPath: 'id' });
    ops.createIndex(OPS_BY_OWNER, ['userId', 'orgId', 'createdAt']);
    ops.createIndex(OPS_BY_KEY, ['userId', 'orgId', 'flockId', 'day']);
    const review = db.createObjectStore(REVIEW, { keyPath: 'id' });
    review.createIndex(REVIEW_BY_OWNER, ['userId', 'orgId']);
  }
}

export function openOutbox(name: string = DB_NAME): Promise<IDBDatabase> {
  return openDatabase(name, DB_VERSION, upgradeOutbox);
}

function isQueueable(fn: string): fn is QueueableFunction {
  return (QUEUEABLE_FUNCTIONS as readonly string[]).includes(fn);
}

function mergePayload(older: FlockDayPayload, newer: FlockDayPayload): FlockDayPayload {
  const merged: Record<string, unknown> = { ...older };
  for (const [field, value] of Object.entries(newer)) {
    if (value !== null && value !== undefined) merged[field] = value;
  }
  return merged as FlockDayPayload;
}

function sameKey(store: IDBObjectStore, op: Pick<OutboxOp, 'userId' | 'orgId' | 'flockId' | 'day'>) {
  return requestResult(
    store.index(OPS_BY_KEY).getAll([op.userId, op.orgId, op.flockId, op.day]) as IDBRequest<OutboxOp[]>,
  );
}

export interface EnqueueInput {
  fn: string;
  flockId: string;
  day: string;
  payload: FlockDayPayload;
  baseVersion: number | null;
}

/**
 * يحفظ جولة بالطابور مختومة بالهويّة المؤكّدة، ويدمجها ويّا عملية نفس المفتاح اللي ما انبعثت بعد.
 * الشاشات ما تناديه: تنادي saveRound (round.ts) اللي يسأل persisted() وراه.
 */
export async function enqueue(db: IDBDatabase, stamp: Stamp, input: EnqueueInput, now = Date.now()): Promise<OutboxOp> {
  const fn = input.fn;
  if (!isQueueable(fn)) throw new OutboxError('not_queueable');
  if (!stamp.userId || !stamp.orgId) throw new OutboxError('no_identity');
  return transact(db, OPS, 'readwrite', async (tx) => {
    const store = tx.objectStore(OPS);
    const key = { userId: stamp.userId, orgId: stamp.orgId, flockId: input.flockId, day: input.day };
    const existing = await sameKey(store, key);
    // الدمج بأحدث عملية للمفتاح بس، وبس إذا بعدها منتظرة: عمليتان منتظرتان لنفس اليوم ممكنة
    // (عملية رجعت للانتظار بلا ما تنبعث)، والدمج بالأقدم كان يرفع القيمة الجديدة أوّل وتدوسها القديمة.
    const newest = existing.reduce<OutboxOp | null>((latest, op) => (!latest || op.createdAt > latest.createdAt ? op : latest), null);
    const open = newest?.state === 'pending' ? newest : null;
    if (open) {
      const merged: OutboxOp = { ...open, payload: mergePayload(open.payload, input.payload), updatedAt: now };
      await requestResult(store.put(merged));
      return merged;
    }
    // ترتيب صارم لنفس المفتاح حتى لو انحفظت عمليتان بنفس الملّي ثانية.
    const createdAt = existing.reduce((latest, op) => Math.max(latest, op.createdAt + 1), now);
    const op: OutboxOp = {
      id: crypto.randomUUID(),
      fn,
      ...key,
      displayName: stamp.displayName,
      payload: { ...input.payload },
      baseVersion: input.baseVersion,
      state: 'pending',
      attempts: 0,
      claimToken: null,
      claimedAt: null,
      createdAt,
      updatedAt: now,
      lastError: null,
    };
    await requestResult(store.add(op));
    return op;
  });
}

interface Claimed {
  op: OutboxOp;
  /** النتيجة مجهولة: نسأل الخادم بالمرجع قبل أي إعادة. */
  resolveFirst: boolean;
  /** حالتها قبل المسك، ترجعلها إذا ما انبعث شي. */
  previous: OpState;
}

/**
 * مسك حيّ = عمره بين صفر والمهلة. مسك مختوم بالمستقبل (ساعة الجهاز رجعت لورا بعده) ميّت مو حيّ:
 * لو انحسب حيّاً يسدّ العملية وكل تعديلات يومها لحدّ ما الساعة الصحيحة تعبر الختم الغلط.
 */
function liveClaim(op: OutboxOp, now: number): boolean {
  if (op.state !== 'sending' || op.claimedAt === null) return false;
  const age = now - op.claimedAt;
  return age >= 0 && age < STALE_CLAIM_MS;
}

/** يمسك أقدم عملية للمستخدم والمنشأة بمعاملة وحدة، فنافذتان ما تمسكان نفس العملية. */
function claimNext(db: IDBDatabase, stamp: Stamp, token: string, now: number): Promise<Claimed | null> {
  return transact(db, OPS, 'readwrite', async (tx) => {
    const store = tx.objectStore(OPS);
    const range = IDBKeyRange.bound([stamp.userId, stamp.orgId, -Infinity], [stamp.userId, stamp.orgId, Infinity]);
    const ops = await requestResult(store.index(OPS_BY_OWNER).getAll(range) as IDBRequest<OutboxOp[]>);
    const blockedKeys = new Set<string>();
    for (const op of ops) {
      const key = `${op.flockId}\u0000${op.day}`;
      if (blockedKeys.has(key)) continue;
      if (liveClaim(op, now)) {
        blockedKeys.add(key);
        continue;
      }
      const resolveFirst = op.state === 'unknown' || op.state === 'sending';
      // مسك ميّت نتيجته مجهولة: يرجع unknown مو sending بلا ماسك، والثنتين تنحسم بمرجعها أوّلاً.
      const previous: OpState = op.state === 'sending' ? 'unknown' : op.state;
      const claimed: OutboxOp = { ...op, state: 'sending', claimToken: token, claimedAt: now, updatedAt: now };
      await requestResult(store.put(claimed));
      return { op: claimed, resolveFirst, previous };
    }
    return null;
  });
}

/** يرجّع العملية لحالة انتظار إذا بعدها ماسكتها هاي النافذة. */
function release(db: IDBDatabase, op: OutboxOp, state: OpState, now: number, error: string | null, countAttempt: boolean) {
  return transact(db, OPS, 'readwrite', async (tx) => {
    const store = tx.objectStore(OPS);
    const current = (await requestResult(store.get(op.id) as IDBRequest<OutboxOp | undefined>)) ?? null;
    if (!current || current.claimToken !== op.claimToken) return false;
    await requestResult(
      store.put({
        ...current,
        state,
        claimToken: null,
        claimedAt: null,
        attempts: countAttempt ? current.attempts + 1 : current.attempts,
        lastError: error ?? current.lastError,
        updatedAt: now,
      }),
    );
    return true;
  });
}

function removeSaved(db: IDBDatabase, op: OutboxOp, version: number, now: number) {
  return transact(db, OPS, 'readwrite', async (tx) => {
    const store = tx.objectStore(OPS);
    await requestResult(store.delete(op.id));
    for (const next of await sameKey(store, op)) {
      if (next.id === op.id) continue;
      const base = next.baseVersion === null ? version : Math.max(next.baseVersion, version);
      if (base !== next.baseVersion) await requestResult(store.put({ ...next, baseVersion: base, updatedAt: now }));
    }
    return true;
  });
}

function removeOp(db: IDBDatabase, op: OutboxOp) {
  return transact(db, OPS, 'readwrite', async (tx) => {
    await requestResult(tx.objectStore(OPS).delete(op.id));
    return true;
  });
}

function moveToReview(db: IDBDatabase, op: OutboxOp, result: Extract<SendResult, { kind: 'stale_day' | 'rejected' }>, now: number) {
  const entry: ReviewEntry = {
    id: op.id,
    userId: op.userId,
    orgId: op.orgId,
    displayName: op.displayName,
    op: { ...op, state: 'pending', claimToken: null, claimedAt: null },
    reason: result.kind === 'stale_day' ? 'stale_day' : result.code,
    hint: result.kind === 'rejected' ? result.hint : null,
    server: result.kind === 'stale_day' ? result.server : null,
    at: now,
  };
  return transact(db, [OPS, REVIEW], 'readwrite', async (tx) => {
    await requestResult(tx.objectStore(OPS).delete(op.id));
    await requestResult(tx.objectStore(REVIEW).put(entry));
    return true;
  });
}

export type FlushStop = 'done' | 'no_session' | 'network' | 'identity' | 'subscription';

export interface FlushReport {
  saved: number;
  parked: number;
  review: number;
  stopped: FlushStop;
}

async function sessionUserId(transport: Transport): Promise<string | null> {
  try {
    return await transport.currentUserId();
  } catch { // swallow-ok: جلسة ما انعرفت = ماكو جلسة، فما ينبعث شي
    return null;
  }
}

/**
 * يرفع عمليات المستخدم والمنشأة بالترتيب. قبل كل مسك ومرّة ثانية لصق الإرسال: جلسة بلا خطأ ومستخدمها
 * = المختوم، وإلا ما ينبعث شي.
 */
export async function flush(
  db: IDBDatabase,
  stamp: Stamp,
  transport: Transport,
  clock: () => number = Date.now,
): Promise<FlushReport> {
  const report: FlushReport = { saved: 0, parked: 0, review: 0, stopped: 'done' };
  const token = crypto.randomUUID();
  for (;;) {
    if ((await sessionUserId(transport)) !== stamp.userId) {
      report.stopped = 'no_session';
      return report;
    }
    const claimed = await claimNext(db, stamp, token, clock());
    if (!claimed) return report;
    const { op } = claimed;

    let result: SendResult | null = null;
    try {
      if (claimed.resolveFirst) result = await transport.lookup(op);
      // السؤال عن المرجع رحلة شبكة كاملة (وطويلة على 2G)، والحساب ممكن يتبدّل بنصّها بجهاز مشترك:
      // الهويّة تنفحص من جديد لصق الإرسال، وإلا جولة علي ترتفع بجلسة حسن.
      if (result === null && (await sessionUserId(transport)) === stamp.userId) result = await transport.send(op);
    } catch (error) {
      await release(db, op, 'unknown', clock(), error instanceof Error ? error.message : 'network', true);
      report.stopped = 'network';
      return report;
    }
    if (result === null) {
      // ما انبعث شي: ترجع لحالتها قبل المسك، وما تنحسب محاولة.
      await release(db, op, claimed.previous, clock(), null, false);
      report.stopped = 'no_session';
      return report;
    }

    switch (result.kind) {
      case 'saved':
        await removeSaved(db, op, result.version, clock());
        report.saved += 1;
        break;
      case 'parked':
        await removeOp(db, op);
        report.parked += 1;
        break;
      case 'stale_day':
      case 'rejected':
        await moveToReview(db, op, result, clock());
        report.review += 1;
        break;
      case 'identity_rejected':
        await release(db, op, 'held_identity', clock(), 'identity_rejected', false);
        report.stopped = 'identity';
        return report;
      case 'subscription_expired':
        await release(db, op, 'held_subscription', clock(), 'subscription_expired', false);
        report.stopped = 'subscription';
        return report;
    }
  }
}

export interface QueueSummary {
  /** عمليات الداخل بهاي المنشأة. */
  mine: number;
  held: 'identity' | 'subscription' | null;
  /** عمليات غيره بهذا الجهاز، بلا تفاصيلها: تنتظر دخول أصحابها. */
  others: { userId: string; orgId: string; displayName: string; count: number }[];
}

export async function summarize(db: IDBDatabase, stamp: Stamp): Promise<QueueSummary> {
  const all = await transact(db, OPS, 'readonly', (tx) =>
    requestResult(tx.objectStore(OPS).getAll() as IDBRequest<OutboxOp[]>),
  );
  const summary: QueueSummary = { mine: 0, held: null, others: [] };
  const others = new Map<string, QueueSummary['others'][number]>();
  for (const op of all) {
    if (op.userId === stamp.userId && op.orgId === stamp.orgId) {
      summary.mine += 1;
      if (op.state === 'held_identity') summary.held = 'identity';
      else if (op.state === 'held_subscription' && summary.held === null) summary.held = 'subscription';
      continue;
    }
    const key = `${op.userId}\u0000${op.orgId}`;
    const entry = others.get(key) ?? { userId: op.userId, orgId: op.orgId, displayName: op.displayName, count: 0 };
    entry.count += 1;
    others.set(key, entry);
  }
  summary.others = [...others.values()];
  return summary;
}

/** رفّ المراجعة لصاحبه بس. */
export function reviewEntries(db: IDBDatabase, stamp: Stamp): Promise<ReviewEntry[]> {
  return transact(db, REVIEW, 'readonly', (tx) =>
    requestResult(
      tx.objectStore(REVIEW).index(REVIEW_BY_OWNER).getAll([stamp.userId, stamp.orgId]) as IDBRequest<ReviewEntry[]>,
    ),
  );
}
