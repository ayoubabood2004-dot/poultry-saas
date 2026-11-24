import { openDatabase, requestResult, transact } from '../idb';
import {
  QUEUEABLE_FUNCTIONS,
  type DayOp,
  type DeadOp,
  type FlockDayPayload,
  type FlockDeadPayload,
  type FlockGasAddPayload,
  type FlockGasPayload,
  type GasAddOp,
  type GasOp,
  type FlockVisitPayload,
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
// - الزيارات (0032) تُجمع بالخادم: لا تندمج زيارة بزيارة أخرى ولا بمجموع اليوم، وتعديل زيارة لم تُرفع يحلّ محلّ محتواها، ونسختها
//   ترتفع للعمليات اللاحقة لنفس الزيارة وحدها. والقاعدة بنسخة 2 (الحقول داخل payload، فلا مخزن جديد): نافذة بحزمة قبل 0032 تعدّ
//   save_flock_visit مجموع يوم (ترفعها بـsave_flock_day وتدمجها وترفع نسختها)، فالترقية تسكّر اتصالها وفتحها بالنسخة 1 يفشل بصوت.
// - رفض الهويّة والاشتراك يخلّيها تنتظر: ما ينحسب محاولة وما يروح لرفّ المراجعة.
// - المرفوض يروح لرفّ مراجعة بالنسختين وما ينحذف إلا بيد صاحبه («احذفه»؛ الحذف بعد عشر محاولات كان سطر كونسول). والمركون بالخادم (parked)
//   مثله منذ 0035: كان يُحذف من الجهاز بصمت (طلب المالك 2026-11-21: «لا تسقط عملية بصمت»)، فصار يبقى في الرفّ بسببه.
// - غاز اليوم (set_flock_gas، 0035) عملية لـ«فوج + يوم» بنسخة صفّه هو: يندمج بأحدث عملية غاز منتظرة لليوم وحدها، ونسخته ترتفع لعمليات الغاز بعده
//   وحدها؛ ولا يقطع دمج مجموع اليوم ولا يدخله.
// - الجولة (0036): هلاكات اليوم مرّة (set_flock_dead) تحلّ قيمتها الأحدث محلّ أحدث عملية هلاكات منتظرة لليوم، وتقطع دمج مجموع اليوم (تغيّر صفّه) وترفع
//   نسخته لما بعدها من مجموع اليوم كالزيارة؛ وقناني أُرسلت الآن (add_flock_gas) تُجمع في أحدث إضافة منتظرة لليوم (لم تُرسل قطّ، فمرجعها لم يُستعمل)، وما في
//   الطريق أو مجهول النتيجة لا يُمسّ: الإضافة التالية عملية بمرجعها، فلا يضيع شيء ولا يُرسل مرّتين؛ وغاز اليوم بعد الإضافة يرفع نسخته لتصحيح الورقة بعدها.

const DB_NAME = 'poultry-outbox';
const DB_VERSION = 4;
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
 * النسخة الجاية تضيف `if (oldVersion < 3)` تحت آخرها. مصدّرة حتى الفحص يشغّلها كترقية نسخة أعلى.
 */
export function upgradeOutbox(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    const ops = db.createObjectStore(OPS, { keyPath: 'id' });
    ops.createIndex(OPS_BY_OWNER, ['userId', 'orgId', 'createdAt']);
    ops.createIndex(OPS_BY_KEY, ['userId', 'orgId', 'flockId', 'day']);
    const review = db.createObjectStore(REVIEW, { keyPath: 'id' });
    review.createIndex(REVIEW_BY_OWNER, ['userId', 'orgId']);
  }
  if (oldVersion < 2) {
    // 0032 (الزيارات): لا مخزن ولا فهرس جديد، والعمليات القديمة كما هي. رفع النسخة وحده يفصل نافذة الحزمة القديمة عن الطابور: يصلها
    // versionchange فتسكّر اتصالها (idb.ts)، وفتحها التالي بالنسخة 1 يرفض (VersionError) بدل أن ترفع زيارة بـsave_flock_day أو تدمجها بمجموع اليوم
    // أو تلغيها بصمت.
  }
  if (oldVersion < 3) {
    // 0035 (ورقة القاعة): لا مخزن ولا فهرس جديد. الرفع يفصل نافذة الحزمة القديمة: كانت ترسل عملية الغاز بـsave_flock_day بلا خانات (فتُعدّ
    // «حُفظت» ويضيع الغاز) وتحذف المركون من الجهاز بصمت.
  }
  if (oldVersion < 4) {
    // 0036 (الجولة): لا مخزن ولا فهرس جديد. الرفع يفصل نافذة الحزمة القديمة: كانت ترسل set_flock_dead وadd_flock_gas بـsave_flock_day (فتكتب هلاكات
    // اليوم مجموعاً بلا علمها، وتُعدّ الإضافة «حُفظت» بلا خانات ويضيع الغاز)، وتدمج مجموع اليوم فوق هلاكات لم تُرفع.
  }
}

export function openOutbox(name: string = DB_NAME): Promise<IDBDatabase> {
  return openDatabase(name, DB_VERSION, upgradeOutbox);
}

function isQueueable(fn: string): fn is QueueableFunction {
  return (QUEUEABLE_FUNCTIONS as readonly string[]).includes(fn);
}

/** عملية تعدّ «مجموع اليوم» في الدمج والنسخة: مجموع اليوم والزيارة وهلاكات اليوم (لا الغاز بنوعيه: صفّه ونسخته غير صفّ اليوم). */
const dayLike = (op: OutboxOp): boolean => op.fn !== 'set_flock_gas' && op.fn !== 'add_flock_gas';

/** حدود الخادم: الطيور حتى عشرة ملايين، والقناني حتى 1,000 لليوم. */
const MAX_BIRDS = 10_000_000;
const MAX_CYLINDERS = 1000;
const whole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

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

export type EnqueueInput =
  | { fn: 'save_flock_day'; flockId: string; day: string; payload: FlockDayPayload; baseVersion: number | null }
  | {
      fn: 'save_flock_visit';
      flockId: string;
      day: string;
      payload: FlockVisitPayload;
      baseVersion: number | null;
      /**
       * تعديل زيارة قائمة أو إلغاؤها («عدّل» و«ألغِ»)، لا زيارة جديدة. بنسخة null هي زيارة أضافها هذا الجهاز: إن خرجت عمليتها من الطابور (رُفعت
       * والنافذة مفتوحة) فنسختها 1. والإلغاء تعديلٌ دائماً.
       */
      amend?: boolean;
    }
  | { fn: 'set_flock_gas'; flockId: string; day: string; payload: FlockGasPayload; baseVersion: number | null }
  /** 0036: هلاكات اليوم مرّة، بلا نسخة. */
  | { fn: 'set_flock_dead'; flockId: string; day: string; payload: FlockDeadPayload; baseVersion: null }
  /** 0036: قناني أُرسلت الآن تُضاف إلى مجموع اليوم، بلا نسخة. */
  | { fn: 'add_flock_gas'; flockId: string; day: string; payload: FlockGasAddPayload; baseVersion: null };

/** معرّف الزيارة لعملية زيارة، وإلا null. */
export const visitIdOf = (op: OutboxOp): string | null => (op.fn === 'save_flock_visit' ? op.payload.visitId : null);

const newestOf = (ops: readonly OutboxOp[]) => ops.reduce<OutboxOp | null>((latest, op) => (!latest || op.createdAt > latest.createdAt ? op : latest), null);

/**
 * يحفظ جولة بالطابور مختومة بالهويّة المؤكّدة، ويدمجها ويّا عملية اللي ما انبعثت بعد: مجموع اليوم (save_flock_day) بأحدث عملية للمفتاح إذا
 * هي منتظرة ومن نوعها، والزيارة (save_flock_visit) بأحدث عملية منتظرة لنفس الزيارة وحدها (زيارتان مختلفتان تُجمعان بالخادم فلا تندمجان، ولا
 * تندمج زيارة بمجموع اليوم). إلغاء زيارة جديدة ما انرفعت يحذف عمليتها ويرجّع null (لا شيء يُرسل)، وهذا وحده null.
 * الشاشات ما تناديه: تنادي saveRound أو saveRounds (round.ts) اللي يسألان persisted() وراه.
 * جولة كاملة بمعاملة IndexedDB واحدة (مراجعة 0036 R3): كلّ عملياتها تُكتب بقواعد الدمج نفسها، أو لا يُكتب شيء. كان «احفظ الجولة» يكتب عملية بعد عملية،
 * ففشل كتابة في منتصفه (التخزين ممتلئ) أبقى ما قبله في الطابور وخاناته مكتوبة، والضغطة الثانية تجمع الغاز مرّتين وتضيف زيارة البيض ثانيةً. والمعاملة
 * readwrite على مخزن العمليات تتسلسل بين التبويبات كما كانت كلّ عملية.
 */
export async function enqueueAll(db: IDBDatabase, stamp: Stamp, inputs: readonly EnqueueInput[], now = Date.now()): Promise<(OutboxOp | null)[]> {
  // كلّ الفحوص قبل أيّ كتابة: عملية لا تدخل الطابور ترفض الجولة كلّها.
  for (const input of inputs) {
    const fn: string = input.fn;
    if (!isQueueable(fn)) throw new OutboxError('not_queueable');
    if (input.fn === 'save_flock_visit' && (typeof input.payload?.visitId !== 'string' || input.payload.visitId === '')) throw new OutboxError('not_queueable');
    if (input.fn === 'set_flock_gas') {
      const cylinders = input.payload?.cylinders;
      if (cylinders !== null && !whole(cylinders, 0, MAX_CYLINDERS)) throw new OutboxError('not_queueable');
    }
    // 0036: الهلاكات عدد صحيح بحدود الخادم، والإضافة قنينة على الأقلّ وحتى 1,000؛ ولا نسخة لأيّهما.
    if (input.fn === 'set_flock_dead' && (!whole(input.payload?.dead, 0, MAX_BIRDS) || input.baseVersion !== null)) throw new OutboxError('not_queueable');
    if (input.fn === 'add_flock_gas' && (!whole(input.payload?.add, 1, MAX_CYLINDERS) || input.baseVersion !== null)) throw new OutboxError('not_queueable');
  }
  if (!stamp.userId || !stamp.orgId) throw new OutboxError('no_identity');
  return transact(db, OPS, 'readwrite', async (tx) => {
    const store = tx.objectStore(OPS);
    const written: (OutboxOp | null)[] = [];
    for (const input of inputs) written.push(await write(store, stamp, input, now));
    return written;
  });
}

/** عملية واحدة داخل معاملة مفتوحة: الدمج بعمليات مفتاحها كما هي فيها (ومنها ما كُتب قبلها في المعاملة نفسها)، أو عملية جديدة. */
async function write(store: IDBObjectStore, stamp: Stamp, input: EnqueueInput, now: number): Promise<OutboxOp | null> {
  const key = { userId: stamp.userId, orgId: stamp.orgId, flockId: input.flockId, day: input.day };
  const existing = await sameKey(store, key);
  let baseVersion = input.baseVersion;
  if (input.fn === 'set_flock_dead') {
    // أحدث عملية هلاكات لليوم وحدها، وبس إذا بعدها منتظرة: القيمة الأحدث تحلّ محلّ القديمة (لم تُرسل، فلا شيء يُضاف).
    const open = newestOf(existing.filter((op) => op.fn === 'set_flock_dead'));
    if (open?.fn === 'set_flock_dead' && open.state === 'pending') {
      const merged: DeadOp = { ...open, payload: { dead: input.payload.dead }, updatedAt: now };
      await requestResult(store.put(merged));
      return merged;
    }
  } else if (input.fn === 'add_flock_gas') {
    // أحدث إضافة لليوم وحدها، وبس إذا بعدها منتظرة (لم تُرسل قطّ): تُجمع فيها. والمجموع لا يتجاوز 1,000 (حدّ الخادم ليوم)، وإلّا عملية بجنبها.
    const open = newestOf(existing.filter((op) => op.fn === 'add_flock_gas'));
    if (open?.fn === 'add_flock_gas' && open.state === 'pending' && open.payload.add + input.payload.add <= MAX_CYLINDERS) {
      const merged: GasAddOp = { ...open, payload: { add: open.payload.add + input.payload.add }, updatedAt: now };
      await requestResult(store.put(merged));
      return merged;
    }
  } else if (input.fn === 'set_flock_gas') {
    // أحدث عملية غاز لليوم وحدها، وبس إذا بعدها منتظرة: القيمة الأحدث تحلّ محلّ القديمة، ونسختها كما هي.
    const open = newestOf(existing.filter((op) => op.fn === 'set_flock_gas'));
    if (open?.fn === 'set_flock_gas' && open.state === 'pending') {
      const merged: GasOp = { ...open, payload: { cylinders: input.payload.cylinders }, updatedAt: now };
      await requestResult(store.put(merged));
      return merged;
    }
  } else if (input.fn === 'save_flock_visit') {
    const visitId = input.payload.visitId;
    const own = existing.filter((op) => visitIdOf(op) === visitId);
    // الدمج بأحدث عملية للزيارة بس، وبس إذا بعدها منتظرة (عملية ممسوكة أو مجهولة تنحسم أوّلاً، والتالية بعدها بنسختها).
    const open = newestOf(own);
    if (open?.fn === 'save_flock_visit' && open.state === 'pending') {
      if (input.payload.void && open.baseVersion === null) {
        await requestResult(store.delete(open.id));
        return null;
      }
      // المحتوى كاملاً يحلّ محلّ محتواها، ونسختها كما هي (النسخة التي يفحصها الخادم).
      const merged: OutboxOp = { ...open, payload: { ...input.payload }, updatedAt: now };
      await requestResult(store.put(merged));
      return merged;
    }
    // تعديل زيارة أضافها هذا الجهاز أو إلغاؤها (بلا نسخة) وعمليتها لم تعد بالطابور: رُفعت بعد ما فُتحت النافذة (أو رُدّت)، فنسختها 1 ما لم
    // تُعدَّل من جهاز آخر (والخادم يجيب حينها stale_visit). كان الإلغاء يرجّع null فيُقال «أُلغيت قبل أن تُرسل» وهي بالخادم، والتعديل يصير إضافة
    // لمعرّف موجود (stale_visit). وعمليتها في الطريق (ممسوكة أو مجهولة): نسخة null، وحفظها يرفعها (removeSaved).
    if ((input.amend || input.payload.void) && input.baseVersion === null && own.length === 0) baseVersion = 1;
  } else {
    // الدمج بأحدث عملية للمفتاح بس، وبس إذا بعدها منتظرة ومن نوعها: عمليتان منتظرتان لنفس اليوم ممكنة (عملية رجعت للانتظار بلا ما
    // تنبعث)، والدمج بالأقدم كان يرفع القيمة الجديدة أوّل وتدوسها القديمة؛ وزيارة بعدها تقطع الدمج فيبقى الترتيب كما كُتب.
    const open = newestOf(existing.filter(dayLike));
    if (open?.fn === 'save_flock_day' && open.state === 'pending') {
      const merged: DayOp = { ...open, payload: mergePayload(open.payload, input.payload), updatedAt: now };
      await requestResult(store.put(merged));
      return merged;
    }
  }
  // ترتيب صارم لنفس المفتاح حتى لو انحفظت عمليتان بنفس الملّي ثانية.
  const createdAt = existing.reduce((latest, op) => Math.max(latest, op.createdAt + 1), now);
  const op = {
    id: crypto.randomUUID(),
    fn: input.fn,
    ...key,
    displayName: stamp.displayName,
    payload: { ...input.payload },
    baseVersion,
    state: 'pending',
    attempts: 0,
    claimToken: null,
    claimedAt: null,
    createdAt,
    updatedAt: now,
    lastError: null,
  } as OutboxOp;
  await requestResult(store.add(op));
  return op;
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

/** نسخة صفّ اليوم في جواب زيارة محفوظة (flock_day_json بعد الزيارة)، أو null: لا تبقى زيارة حيّة، أو شكل غريب. */
export function visitDayVersion(day: unknown): number | null {
  if (typeof day !== 'object' || day === null) return null;
  const version = (day as { version?: unknown }).version;
  return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : null;
}

/** النسخة التي ترفعها عملية حُفظت لعملية بعدها لنفس (الفوج، اليوم)، أو null: لا علاقة بين نسختيهما. */
function versionFor(op: OutboxOp, saved: Extract<SendResult, { kind: 'saved' }>, next: OutboxOp): number | null {
  switch (op.fn) {
    case 'set_flock_gas':
    case 'add_flock_gas':
      // غاز اليوم بعد التصحيح أو الإضافة: نسخة صفّه لتصحيح الغاز بعده (الإضافة لا نسخة لها).
      return next.fn === 'set_flock_gas' ? saved.version : null;
    case 'save_flock_day':
      return next.fn === 'save_flock_day' ? saved.version : null;
    case 'set_flock_dead':
      // هلاكات اليوم تغيّر صفّه: نسخته بعدها (من جوابها) لمجموع اليوم بعدها، كالزيارة.
      return next.fn === 'save_flock_day' ? visitDayVersion(saved.day) : null;
    case 'save_flock_visit':
      if (visitIdOf(next) === op.payload.visitId) return saved.version;
      // الزيارة تغيّر صفّ اليوم أيضاً: نسخته بعدها (من جوابها) لعمليات مجموع اليوم بعدها، وإلا رُدّت stale_day وهي كُتبت على ما يراه صاحبها (مراجعة
      // 0035: زيارة ثمّ هلاكات اليوم من الورقة قبل الرفع).
      return next.fn === 'save_flock_day' ? visitDayVersion(saved.day) : null;
  }
}

function removeSaved(db: IDBDatabase, op: OutboxOp, saved: Extract<SendResult, { kind: 'saved' }>, now: number) {
  return transact(db, OPS, 'readwrite', async (tx) => {
    const store = tx.objectStore(OPS);
    await requestResult(store.delete(op.id));
    for (const next of await sameKey(store, op)) {
      if (next.id === op.id) continue;
      // النسخة لما بعدها من النوع نفسه: نسخة صفّ اليوم لعمليات مجموع اليوم، ونسخة الزيارة لعمليات الزيارة نفسها (لا لزيارة أخرى)، ونسخة صفّ الغاز
      // لعمليات الغاز؛ ونسخة صفّ اليوم بعد زيارة لعمليات مجموع اليوم.
      const version = versionFor(op, saved, next);
      if (version === null) continue;
      const base = next.baseVersion === null ? version : Math.max(next.baseVersion, version);
      if (base !== next.baseVersion) await requestResult(store.put({ ...next, baseVersion: base, updatedAt: now }));
    }
    return true;
  });
}

/**
 * يرفع العملية من الطابور إلى رفّ المراجعة بسببها: الرفض برمزه وتلميحه، والنسخة الأقدم (stale_*) بقيمة الخادم، والمركون («parked») وسبب ركنه في hint
 * (flock_closed وout_of_scope وperiod_locked، أو date_too_old من خادم قبل 0035)، وهلاكات يوم سُجّلت قبلها (dead_recorded، 0036) بصفّ اليوم كما هو.
 */
function moveToReview(db: IDBDatabase, op: OutboxOp, result: Extract<SendResult, { kind: 'stale_day' | 'stale_visit' | 'stale_gas' | 'dead_recorded' | 'rejected' | 'parked' }>, now: number) {
  const entry: ReviewEntry = {
    id: op.id,
    userId: op.userId,
    orgId: op.orgId,
    displayName: op.displayName,
    op: { ...op, state: 'pending', claimToken: null, claimedAt: null },
    reason: result.kind === 'rejected' ? result.code : result.kind,
    hint: result.kind === 'rejected' ? result.hint : result.kind === 'parked' ? (result.reason ?? null) : null,
    server: result.kind === 'rejected' || result.kind === 'parked' ? null : result.server,
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
        await removeSaved(db, op, result, clock());
        report.saved += 1;
        break;
      case 'parked':
        await moveToReview(db, op, result, clock());
        report.parked += 1;
        break;
      case 'stale_day':
      case 'stale_visit':
      case 'stale_gas':
      case 'dead_recorded':
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

/**
 * عمليات الداخل بهاي المنشأة اللي ما انرفعت بعد (كل الحالات)، بترتيب إنشائها: الجولة تعرض قيمها فوق المحفوظ بالخادم وتنقّص الحيّ
 * المحلّي بيها (FOUNDATION ٢١٧). قراءة بس.
 */
export function pendingOps(db: IDBDatabase, stamp: Stamp): Promise<OutboxOp[]> {
  const range = IDBKeyRange.bound([stamp.userId, stamp.orgId, -Infinity], [stamp.userId, stamp.orgId, Infinity]);
  return transact(db, OPS, 'readonly', (tx) => requestResult(tx.objectStore(OPS).index(OPS_BY_OWNER).getAll(range) as IDBRequest<OutboxOp[]>));
}

/** «احذفه» من رفّ المراجعة بيد صاحبه وحده (صفّ مستخدمه ومنشأته): الحذف الوحيد للرفّ. */
export function removeReview(db: IDBDatabase, stamp: Stamp, id: string): Promise<boolean> {
  return transact(db, REVIEW, 'readwrite', async (tx) => {
    const store = tx.objectStore(REVIEW);
    const entry = (await requestResult(store.get(id) as IDBRequest<ReviewEntry | undefined>)) ?? null;
    if (!entry || entry.userId !== stamp.userId || entry.orgId !== stamp.orgId) return false;
    await requestResult(store.delete(id));
    return true;
  });
}

/** رفّ المراجعة لصاحبه بس. */
export function reviewEntries(db: IDBDatabase, stamp: Stamp): Promise<ReviewEntry[]> {
  return transact(db, REVIEW, 'readonly', (tx) =>
    requestResult(
      tx.objectStore(REVIEW).index(REVIEW_BY_OWNER).getAll([stamp.userId, stamp.orgId]) as IDBRequest<ReviewEntry[]>,
    ),
  );
}
