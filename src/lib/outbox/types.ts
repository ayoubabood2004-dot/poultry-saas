// الطابور بلا نت لفشل الشبكة وحده. ما يدخله إلا save_flock_day (مفتاح طبيعي «فوج + يوم» وbase_version):
// ماكو post_* ولا تسديد، لأن السحب من الدفعات والديون يحتاج الرصيد الحقيقي لحظة الترحيل.

export const QUEUEABLE_FUNCTIONS = ['save_flock_day'] as const;
export type QueueableFunction = (typeof QUEUEABLE_FUNCTIONS)[number];

/** ختم الهويّة: المستخدم والمنشأة اللي أكّدها الخادم لحظة الحفظ. العملية ما ترتفع إلا بهويّتها. */
export interface Stamp {
  userId: string;
  orgId: string;
  displayName: string;
}

/** خانات الجولة مجموع اليوم مو إضافة. null أو غياب الخانة = «بلا تغيير»، و0 = صفر. */
export interface FlockDayPayload {
  dead?: number | null;
  culled?: number | null;
  feed_kg?: string | null;
  water_l?: string | null;
  temp_min?: string | null;
  temp_max?: string | null;
  eggs_total?: number | null;
  eggs_cracked?: number | null;
  eggs_broken?: number | null;
  note?: string | null;
}

export type OpState =
  /** تنتظر الرفع، وتندمج ويّاها التعديلات اللاحقة لنفس (المستخدم، المنشأة، الفوج، اليوم). */
  | 'pending'
  /** نافذة ماسكتها وترفعها هسه. */
  | 'sending'
  /** طلعت وجوابها ما رجع: تنحسم بمرجعها أوّلاً قبل أي إعادة. */
  | 'unknown'
  /** الخادم رفض الهويّة: تنتظر دخولاً جديداً، ما تنحسب محاولة وما تروح لرفّ المراجعة. */
  | 'held_identity'
  /** الاشتراك منتهي: محفوظة بالجهاز وترتفع بعد التجديد. */
  | 'held_subscription';

export interface OutboxOp extends Stamp {
  /** client_ref مولود بالجهاز: الإعادة بنفسه ما تضاعف شي. */
  id: string;
  /** اسم الدالّة اللي انكتبت إلها (save_flock_day، وبعدين _v2): الرافع ينادي نفسها. */
  fn: QueueableFunction;
  flockId: string;
  day: string;
  payload: FlockDayPayload;
  /** نسخة صفّ اليوم اللي شافها المستخدم؛ null = «أتوقّع ماكو صفّ». */
  baseVersion: number | null;
  state: OpState;
  attempts: number;
  claimToken: string | null;
  claimedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
}

/** رفّ المراجعة: المرفوض من الخادم بالنسختين جنب بعض، وما ينحذف تلقائياً أبداً. */
export interface ReviewEntry extends Stamp {
  id: string;
  op: OutboxOp;
  reason: string;
  hint: string | null;
  server: unknown;
  at: number;
}

export type SendResult =
  | { kind: 'saved'; version: number }
  /** الفوج انقفل أو القاعة طلعت من النطاق أو التاريخ صار قديماً: الخادم ركنها للمدير (flock_day_rejects). */
  | { kind: 'parked' }
  /** base_version أقدم من المحفوظ: رفّ المراجعة بالنسختين. */
  | { kind: 'stale_day'; server: unknown }
  | { kind: 'rejected'; code: string; hint: string | null }
  /** 401، أو 42501 على الدالّة، أو PGRST301. */
  | { kind: 'identity_rejected' }
  | { kind: 'subscription_expired' };

/** النقل للخادم، يتحقن حتى يتفحص الطابور بلا شبكة. */
export interface Transport {
  /** user.id من getSession() إذا رجّعت جلسة بلا خطأ، وإلا null. */
  currentUserId(): Promise<string | null>;
  /** ينادي دالّة العملية بمرجعها. يرمي على فشل الشبكة (النتيجة مجهولة). */
  send(op: OutboxOp): Promise<SendResult>;
  /** يسأل الخادم عن نتيجة مرجع قديم؛ null = ما وصله. */
  lookup(op: OutboxOp): Promise<SendResult | null>;
}
