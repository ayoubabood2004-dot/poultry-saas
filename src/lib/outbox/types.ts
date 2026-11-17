// الطابور بلا نت لفشل الشبكة وحده. ما يدخله إلا كتابات الجولة: save_flock_day (مفتاح طبيعي «فوج + يوم» وbase_version، تبقى لعمليات مخزّنة
// قبل 0032) وsave_flock_visit (0032: زيارة بمعرّف من الجهاز ونسختها، تُجمع ولا تتعارض). ماكو post_* ولا تسديد، لأن السحب من الدفعات والديون
// يحتاج الرصيد الحقيقي لحظة الترحيل.

export const QUEUEABLE_FUNCTIONS = ['save_flock_day', 'save_flock_visit'] as const;
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
  /** الماء خارج الجولة (كلمة المالك 2026-11-11): لا تكتبه الجولة، وعملية قديمة بالطابور تحمله تُرسل كما هي. */
  water_l?: string | null;
  temp_min?: string | null;
  temp_max?: string | null;
  eggs_total?: number | null;
  eggs_cracked?: number | null;
  eggs_broken?: number | null;
  note?: string | null;
}

/**
 * زيارة (0032) بمحتواها كاملاً، لا «بلا تغيير»: الإضافة والتعديل والإلغاء كلّها بالمحتوى نفسه، والفارغ فارغ (النافق والمستبعد 0، والباقي null).
 * recordedAt وقت التسجيل على الجهاز (ISO)، والتعديل يحمل وقت الزيارة الأصليّ.
 */
export interface FlockVisitPayload {
  visitId: string;
  recordedAt: string;
  /** null: لم يُكتب في الزيارة (الخادم يعدّه صفراً في العمود)؛ والصفر المكتوب صفر. */
  dead: number | null;
  culled: number | null;
  feed_kg: string | null;
  eggs_total: number | null;
  eggs_cracked: number | null;
  eggs_broken: number | null;
  note: string | null;
  void: boolean;
}

export type OpState =
  /** تنتظر الرفع، وتندمج ويّاها التعديلات اللاحقة (لنفس اليوم في save_flock_day، ولنفس الزيارة في save_flock_visit). */
  | 'pending'
  /** نافذة ماسكتها وترفعها هسه. */
  | 'sending'
  /** طلعت وجوابها ما رجع: تنحسم بمرجعها أوّلاً قبل أي إعادة. */
  | 'unknown'
  /** الخادم رفض الهويّة: تنتظر دخولاً جديداً، ما تنحسب محاولة وما تروح لرفّ المراجعة. */
  | 'held_identity'
  /** الاشتراك منتهي: محفوظة بالجهاز وترتفع بعد التجديد. */
  | 'held_subscription';

interface OpBase extends Stamp {
  /** client_ref مولود بالجهاز: الإعادة بنفسه ما تضاعف شي. */
  id: string;
  flockId: string;
  day: string;
  /**
   * save_flock_day: نسخة صفّ اليوم اللي شافها المستخدم (null = «أتوقّع ماكو صفّ»). save_flock_visit: نسخة الزيارة (null = زيارة جديدة).
   */
  baseVersion: number | null;
  state: OpState;
  attempts: number;
  claimToken: string | null;
  claimedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
}

/** اسم الدالّة اللي انكتبت إلها: الرافع ينادي نفسها، والحمولة بشكلها. */
export interface DayOp extends OpBase {
  fn: 'save_flock_day';
  payload: FlockDayPayload;
}

export interface VisitOp extends OpBase {
  fn: 'save_flock_visit';
  payload: FlockVisitPayload;
}

export type OutboxOp = DayOp | VisitOp;

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
  /**
   * version: نسخة صفّ اليوم (save_flock_day) أو نسخة الزيارة (save_flock_visit). والزيارة ترجع معها الزيارة كما حُفظت (visit_json خاماً
   * بعد فحص محلّله) وصفّ اليوم بعدها (flock_day_json، أو null حين لا تبقى زيارة حيّة).
   */
  | { kind: 'saved'; version: number; visit?: unknown; day?: unknown }
  /** الفوج انقفل أو القاعة طلعت من النطاق أو التاريخ صار قديماً: الخادم ركنها للمدير (flock_day_rejects). */
  | { kind: 'parked' }
  /** base_version أقدم من المحفوظ: رفّ المراجعة بالنسختين. */
  | { kind: 'stale_day'; server: unknown }
  /**
   * الزيارة تغيّرت أو أُلغيت بعد ما شافها المستخدم، أو لم تصل الخادم: رفّ المراجعة بـ«زيارتك والمحفوظة» (server = visit_json كما هي، والملغاة
   * voided: true؛ أو null حين لا زيارة بمعرّفها في الخادم).
   */
  | { kind: 'stale_visit'; server: unknown }
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
