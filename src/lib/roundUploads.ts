import type { QueueSummary, SendResult, Stamp, Transport } from './outbox';
import { createStore } from './store';

// رفع الجولات من الجهاز على مستوى التطبيق (FOUNDATION ٢١٧–٢١٩): عدّا الرأس («جولات لك تنتظر الإرسال» و«جولات لغيرك على هذا الجهاز»)،
// ونتائج كل رفع (saved وparked وstale_day…) حتى شاشة الجولة تقول نتيجة كل صفّ حتى لو الرفع صار بالخلفية أو من شاشة ثانية، ونسخة
// الجهاز من قراءة الحقول (الجولة تنفتح بلا نت). مخزن صغير بس: الطابور والرفع بحزمة كسولة (outbox/uploader بـimport())، فما يكبر
// الإقلاع ولا مسار الجلسة، والناقل نفسه (repo/flocks) ما يتحمّل إلا وبالجهاز جولات.

export interface RoundResult {
  flockId: string;
  day: string;
  result: SendResult;
}

export interface RoundRun {
  seq: number;
  /** `${userId}:${orgId}` اللي انرفعت جولاته. */
  key: string;
  results: RoundResult[];
}

export interface RoundQueueState {
  /** المستخدم والمنشأة اللي انعدّ طابورهم ('' = ما انعدّ بعد). */
  key: string;
  mine: number;
  held: QueueSummary['held'];
  others: { displayName: string; count: number }[];
  /** (مستخدم، منشأة) بنسخة جهاز من قراءة الحقول (FOUNDATION ٢١٨: «مو جاهز بلا نت» لحد ما تنحفظ). */
  copies: string[];
  /** يزيد مع كل رفع رجّع نتائج، والنتائج بترتيبها (آخر 20 رفعاً بالجلسة). */
  seq: number;
  runs: RoundRun[];
  /** لكل (مستخدم، منشأة): آخر رفع انقالت نتائجه بشاشة الجولة (بملخّص الحفظ أو بـ«حسناً»)، فالتنبيه ما يرجع بكل فتح للشاشة. */
  acked: Record<string, number>;
}

export const roundQueueStore = createStore<RoundQueueState>({ key: '', mine: 0, held: null, others: [], copies: [], seq: 0, runs: [], acked: {} });

export const stampKey = (stamp: Pick<Stamp, 'userId' | 'orgId'>): string => `${stamp.userId}:${stamp.orgId}`;

const MAX_RUNS = 20;

export function publishRun(key: string, results: RoundResult[]): void {
  if (results.length === 0) return;
  roundQueueStore.set((state) => ({ ...state, seq: state.seq + 1, runs: [...state.runs, { seq: state.seq + 1, key, results }].slice(-MAX_RUNS) }));
}

export function publishCounts(key: string, summary: QueueSummary): void {
  roundQueueStore.set((state) => ({
    ...state,
    key,
    mine: summary.mine,
    held: summary.held,
    others: summary.others.map(({ displayName, count }) => ({ displayName, count })),
  }));
}

export function ackRuns(key: string, seq: number): void {
  roundQueueStore.set((state) => ((state.acked[key] ?? 0) >= seq ? state : { ...state, acked: { ...state.acked, [key]: seq } }));
}

export function markFarmCopy(key: string): void {
  roundQueueStore.set((state) => (state.copies.includes(key) ? state : { ...state, copies: [...state.copies, key] }));
}

/** يعدّ طابور الجهاز للداخل ولغيره وينشر العدّين. */
export function refreshRoundQueue(stamp: Stamp): Promise<number> {
  return import('./outbox').then((outbox) => outbox.refreshQueue(stamp));
}

/**
 * يرفع جولات الداخل (رفع واحد بالمرّة لكل مستخدم ومنشأة؛ طلب أثناء رفع ينتظره ثم يرفع مرّة ثانية) وينشر النتائج والعدّين.
 * loadTransport ما ينادى إلا وبالجهاز جولات.
 */
export function uploadRounds(stamp: Stamp, loadTransport: () => Promise<Transport>): Promise<RoundResult[]> {
  return import('./outbox').then((outbox) => outbox.uploadQueue(stamp, loadTransport));
}
