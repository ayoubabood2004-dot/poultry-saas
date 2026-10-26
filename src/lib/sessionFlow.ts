import type { AcceptResult, NoOrgAccount, Workspace, WorkspaceResult } from '../domain/workspace';
import { IdentityError, NetworkError, NotConnectedError, RetryableError, UnknownOutcomeError } from './errors';
import type { Store } from './store';

// حالة الجلسة كلها بمكان واحد، ودوالّها تجي من برّا (deps) حتى تنفحص بلا شبكة ولا متصفّح.
// القواعد (FOUNDATION ٢٠٣، ٢١٧، ٢٢٨): الخادم يحسم المنشأة، وجوابه يستبدل نسخة الجهاز (no_org يمسح الهويّة المحفوظة)؛
// فشل الشبكة ما يطلّع المستخدم أبداً (يفتح بهويّته المحفوظة إذا عنده، ويتأكّد لمّا يرجع الاتصال)؛ رفض الهويّة بس
// يرجّعه للدخول؛ وجواب قديم (طلب انرسل قبل خروج أو دخول ثاني) ما يدوس الحالة.
//
// عدّادان: generation لكل طلب تأكيد (الأحدث يغلب)، وepoch لكل تبدّل بالداخل (دخول، خروج، انتهاء جلسة). إنشاء
// المنشأة وقبول الدعوة ياخذون تذكرة قبل الإرسال، وجوابهم ينطبق بس إذا الداخل نفسه ما تبدّل (المراجعة العدائية:
// جواب create_my_org متأخّر بعد الخروج رجّع منشأة الأوّل وهويّته على جهاز بلا توكن). والخروج (بإيده أو رفض الهويّة)
// يحسم بـepoch: تأكيد ينطلق بنصّه ما يرجّع المنشأة، ولا يبدأ تأكيد جديد لحد ما يكمل (closing).

export type SessionState =
  | { status: 'not_configured' }
  | { status: 'loading' }
  /** expired: الخادم رفض الجلسة (مو خروج بإيده)، فالدخول يكول «انتهت جلسة الدخول». */
  | { status: 'signed_out'; expired: boolean }
  | { status: 'no_org'; account: NoOrgAccount }
  /** offline: مفتوحة بالهويّة المحفوظة وبعدها ما تأكّدت من الخادم. */
  | { status: 'ready'; workspace: Workspace; offline: boolean }
  /** الحساب داخل والهويّة ما انأكّدت (رفض غير متوقّع، أو بلا نت وبلا هويّة محفوظة). */
  | { status: 'failed'; error: unknown; userId: string | null };

/** previousUserId: كان بالجهاز توكن لهذا الحساب والخادم أنهى جلسته. */
export type SessionProbe =
  | { kind: 'signed_in'; userId: string }
  | { kind: 'signed_out'; previousUserId: string | null }
  | { kind: 'offline'; userId: string };

/** ميزانية الانتظار قبل ما تنفتح الهويّة المحفوظة بإقلاع بطيء: بعدها الجواب يحسم بالخلفية لمّا يوصل. */
export const QUICK_OPEN_MS = 2_500;
/**
 * جلسة ما تأكّدت والجهاز يكول «متّصل»: واي فاي القاعة يرجع نتّه بلا حدث online، والتوكن الصالح ما يتجدّد قبل ساعة.
 * فالتأكيد يتعاد بتباعد يكبر (٣٠ ثانية، يتضاعف، لحد ٥ دقائق) لحد ما ينجح أو ينطلع.
 */
export const RETRY_FIRST_MS = 30_000;
export const RETRY_MAX_MS = 300_000;

export interface SessionDeps {
  /** quick: بتوكن محفوظ ما ينتظر التجديد أكثر من QUICK_OPEN_MS (بلا نت = فوراً)، ويرجع offline. */
  probe(quick: boolean): Promise<SessionProbe>;
  loadWorkspace(): Promise<WorkspaceResult>;
  signOutLocal(): Promise<void>;
  loadSaved(userId: string): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  forget(userId: string): Promise<void>;
  online(): boolean;
  wait(ms: number): Promise<void>;
}

/** تذكرة عملية تبدّل المنشأة (إنشاء أو قبول دعوة)، تنأخذ قبل الإرسال. */
export interface Ticket {
  readonly epoch: number;
  readonly userId: string | null;
}

export interface SessionController {
  boot(): Promise<void>;
  /** دخل (أو انشأ حساباً ودخل): يأكّد هويّته من الخادم. */
  signedIn(userId: string): Promise<void>;
  /**
   * يعيد تأكيد الهويّة. من شاشة «بلا منشأة» فشل الشبكة يبقي الشاشة ويرجع الخطأ لها (رسالة)، مو صفحة فشل تمسح
   * المكتوب؛ وغيرها ينطبق مثل الإقلاع.
   */
  refresh(): Promise<void>;
  /** خرج من المنشأة أو أرشف نفسه: الهويّة المحفوظة تنمسح قبل التأكيد، حتى فشل الشبكة ما يرجّعه لها. */
  left(): Promise<void>;
  /** رجع الاتصال أو انفتح التطبيق: جلسة مفتوحة بلا تأكيد (بلا نت) تتأكّد. طلب واحد بالمرّة. */
  reconnected(): Promise<void>;
  begin(): Ticket;
  /** نتيجة create_my_org أو accept_invite_code (my_workspace() جاهز بيها). false: انرمت لأن الداخل تبدّل. */
  apply(result: WorkspaceResult, ticket: Ticket): boolean;
  applyAccept(result: AcceptResult, ticket: Ticket): AcceptResult;
  signOut(): Promise<void>;
  /** حدث من auth-js: خروج، دخول (بحساب ثاني أو دخول كمل بعد مهلته)، أو تجديد التوكن (الاتصال رجع). */
  authChanged(event: string, userId: string | null): void;
}

function userOf(state: SessionState): string | null {
  switch (state.status) {
    case 'ready':
      return state.workspace.userId;
    case 'no_org':
      return state.account.userId;
    case 'failed':
      return state.userId;
    default:
      return null;
  }
}

function ownerOf(result: WorkspaceResult): string {
  return result.kind === 'member' ? result.workspace.userId : result.account.userId;
}

function isTransient(error: unknown): boolean {
  // RetryableError: قفل متزاحم بالخادم، مثل «ما وصل» (المعاملة رجعت كلها).
  return error instanceof NetworkError || error instanceof RetryableError || error instanceof UnknownOutcomeError;
}

/** جلسة داخلة والخادم بعده ما أكّدها: مفتوحة بالمحفوظة، أو صفحة فشل سببها الشبكة. */
function unconfirmed(state: SessionState): boolean {
  return (state.status === 'ready' && state.offline) || (state.status === 'failed' && isTransient(state.error));
}

export function createSessionController(store: Store<SessionState>, deps: SessionDeps): SessionController {
  let generation = 0;
  let epoch = 0;
  /** خروج (بإيده أو رفض هويّة) بالطريق: لا تأكيد جديد لحد ما يكمل. */
  let closing = 0;
  let reconnecting: { promise: Promise<void>; generation: number } | null = null;
  /** حدث وصل والتأكيد بالطريق: ممكن بدأ قبل ما يرجع النت، فمحاولة وحدة بعده إذا ما نجح. */
  let again = false;
  let retrying = false;
  /** رقم الإقلاع اللي بمرحلة الفحص: SIGNED_OUT بنصّه ما يقطعه (الفحص نفسه يلقى الجلسة راحت ويحسم «انتهت»). */
  let booting = 0;
  /** SIGNED_OUT وصل والإقلاع بمرحلة الفحص: ما يفتح بعده هويّة محفوظة ولا يأكّد. */
  let signedOutWhileBooting = false;
  /** آخر صاحب توكن شافه الإقلاع: SIGNED_OUT بلا داخل بالحالة (وصل بنصّ الإقلاع) يمسح هويّته هو. */
  let lastHolder: string | null = null;
  // كتابات الهويّة المحفوظة بالتسلسل، والقراءة بعدها: «امسح ثم أكّد» ما يقرا النسخة اللي انمسحت.
  let writes: Promise<void> = Promise.resolve();

  function persist(write: () => Promise<void>): Promise<void> {
    writes = writes.then(write).catch(() => {
      /* swallow-ok: الهويّة المحفوظة للإقلاع بلا نت بس؛ الخادم يأكّد بكل إقلاع بالنت */
    });
    return writes;
  }

  /** الهويّة المحفوظة، أو null. حزمتها ما انحمّلت = ماكو هويّة، مو إقلاع واكف. */
  async function savedFor(userId: string): Promise<Workspace | null> {
    await writes;
    try {
      return await deps.loadSaved(userId);
    } catch { // swallow-ok: حزمة الهويّة أو IndexedDB ما اشتغلت = ماكو هويّة محفوظة، والإقلاع يكمل لصفحة الفشل
      return null;
    }
  }

  /** جواب الخادم الموثوق: يستبدل نسخة الجهاز. */
  function settle(result: WorkspaceResult) {
    generation += 1;
    if (result.kind === 'member') {
      store.set({ status: 'ready', workspace: result.workspace, offline: false });
      void persist(() => deps.save(result.workspace));
    } else {
      store.set({ status: 'no_org', account: result.account });
      void persist(() => deps.forget(result.account.userId));
    }
  }

  /**
   * خروج محلّي: الشاشة تبطّل والمحفوظة تنمسح قبل ما ننتظر /logout (لحد ٥ ثواني)، وتأكيد ما يبدأ بنصّه: المراجعة
   * الثانية لقت رفض هويّة انتهى والتطبيق مفتوح بمنشأة الحساب المرفوض بلا توكن، لأن تأكيداً بدأ وهو ينتظر رجّع المحفوظة.
   * الحالة الأخيرة بـepoch: دخول أحدث بس يغلبها.
   */
  async function close(userId: string | null, expired: boolean, blank: boolean): Promise<void> {
    epoch += 1;
    generation += 1;
    const mine = epoch;
    closing += 1;
    if (blank) store.set({ status: 'loading' });
    const forgot = userId ? persist(() => deps.forget(userId)) : Promise.resolve();
    try {
      await deps.signOutLocal();
    } catch {
      /* swallow-ok: الخروج المحلّي يمسح التخزين بنفسه؛ الحالة تحت تصير signed_out بكل حال */
    } finally {
      closing -= 1;
    }
    await forgot;
    if (mine !== epoch) return;
    generation += 1;
    store.set({ status: 'signed_out', expired });
  }

  /** فشل عابر بلا جواب: الهويّة المحفوظة إذا موجودة، وإلا صفحة الفشل. */
  async function fallBack(userId: string, error: unknown, mine: number): Promise<void> {
    const saved = isTransient(error) ? await savedFor(userId) : null;
    if (mine !== generation) return;
    store.set(saved ? { status: 'ready', workspace: saved, offline: true } : { status: 'failed', error, userId });
  }

  async function confirm(userId: string, options: { keep?: boolean; quick?: boolean; fromBoot?: boolean } = {}): Promise<void> {
    const mine = ++generation;
    if (options.quick) {
      // إقلاع بشبكة بطيئة (واي فاي القاعة بلا نت): الهويّة المحفوظة تنفتح بعد QUICK_OPEN_MS، والجواب يحسم لمّا يوصل.
      void deps.wait(QUICK_OPEN_MS).then(async () => {
        if (mine !== generation || store.get().status !== 'loading') return;
        const saved = await savedFor(userId);
        if (saved && mine === generation && store.get().status === 'loading') store.set({ status: 'ready', workspace: saved, offline: true });
      });
    }
    let result: WorkspaceResult;
    try {
      result = await deps.loadWorkspace();
    } catch (error) {
      if (mine !== generation) return;
      if (error instanceof IdentityError) return close(userId, true, true);
      if (options.keep && isTransient(error)) throw error;
      return fallBack(userId, error, mine);
    }
    if (mine !== generation) return;
    if (ownerOf(result) !== userId) {
      // الخادم يجاوب لصاحب التوكن الحالي، وهو مو اللي بالحالة: التوكن تبدّل (تبويب ثاني دخل بحساب ثاني). ما نفتح
      // بهويّة غير صاحبها، ولا نطلّع صاحب التوكن (جلسته صالحة، والخروج كان يلغيها من كل التبويبات): الإقلاع يفحص
      // التوكن ويتبعه. ومن الإقلاع نفسه (الفحص والخادم مختلفين) صفحة فشل بزرّها.
      if (options.fromBoot) {
        store.set({ status: 'failed', error: new IdentityError('user_mismatch'), userId });
        return;
      }
      epoch += 1;
      store.set({ status: 'loading' });
      return boot();
    }
    settle(result);
  }

  /** null: الفحص فشل (الحالة تحمل خطأه) أو صار قديماً (دخول أو خروج بعده، فما يدوس الأحدث). */
  async function probe(quick: boolean, mine: number): Promise<SessionProbe | null> {
    try {
      return await deps.probe(quick);
    } catch (error) { // swallow-ok: الخطأ ما يضيع، ينحفظ بالحالة (الهيكل بلا قاعدة أو صفحة الفشل بزرّها)
      if (mine !== generation) return null;
      store.set(error instanceof NotConnectedError ? { status: 'not_configured' } : { status: 'failed', error, userId: null });
      return null;
    }
  }

  async function boot(): Promise<void> {
    const mine = ++generation;
    booting = mine;
    signedOutWhileBooting = false;
    /** الجلسة انمسحت بنصّ الإقلاع: خارج، مو هويّة محفوظة بلا توكن. */
    const goneMidway = (): boolean => {
      if (!signedOutWhileBooting) return false;
      store.set({ status: 'signed_out', expired: false });
      return true;
    };
    if (store.get().status !== 'ready') store.set({ status: 'loading' });
    let found = await probe(true, mine);
    if (mine !== generation || !found) return;
    lastHolder = found.kind === 'signed_out' ? found.previousUserId : found.userId;
    if (found.kind === 'offline') {
      // توكن محفوظ والتجديد ما كمل: الهويّة المحفوظة لصاحب التوكن نفسه، والتأكيد لمّا يرجع الاتصال.
      const saved = await savedFor(found.userId);
      if (mine !== generation || goneMidway()) return;
      if (saved) {
        store.set({ status: 'ready', workspace: saved, offline: true });
        // متّصل والفحص رجع «بلا نت» لأن التجديد بطيء: التأكيد يبدي هسه، مو بأوّل حدث (ممكن ما يجي).
        if (deps.online()) void reconnected();
        return;
      }
      if (!deps.online()) {
        store.set({ status: 'failed', error: new NetworkError(), userId: found.userId });
        return;
      }
      // متّصل وماكو هويّة محفوظة تنفتح بيها: ننتظر التجديد بمهلته الكاملة.
      found = await probe(false, mine);
      if (mine !== generation || !found) return;
      if (found.kind === 'offline') {
        store.set({ status: 'failed', error: new NetworkError(), userId: found.userId });
        return;
      }
    }
    if (found.kind === 'signed_out') {
      // الخادم أنهى جلسة كانت بالجهاز: هويّتها تنمسح (جهاز مشترك) والدخول يكول «انتهت جلسة الدخول».
      // وSIGNED_OUT (auth-js يأجّله لنهاية initialize) ممكن يسبقنا للحالة: «انتهت الجلسة» تغلبه ما دام ماكو دخول أحدث.
      const previous = found.previousUserId;
      if (previous) await persist(() => deps.forget(previous));
      if (mine !== generation && store.get().status !== 'signed_out') return;
      store.set({ status: 'signed_out', expired: Boolean(previous) });
      return;
    }
    if (goneMidway()) return;
    await confirm(found.userId, { quick: true, fromBoot: true });
  }

  async function refresh(): Promise<void> {
    if (closing > 0) return;
    const state = store.get();
    const userId = userOf(state);
    if (userId) await confirm(userId, { keep: state.status === 'no_org' });
    else await boot();
  }

  function reconnected(): Promise<void> {
    // خروج بالطريق: refresh نفسه ما يبدأ (closing).
    // طلب بالطريق ويّا آخر تأكيد: نفسه. وتأكيد انطوى (خروج ودخول، أو إقلاع جديد) ما يحجز الجديد.
    if (reconnecting && reconnecting.generation === generation) {
      again = true;
      return reconnecting.promise;
    }
    if (!unconfirmed(store.get()) || !deps.online()) return Promise.resolve();
    again = false;
    const promise: Promise<void> = refresh().finally(() => {
      if (reconnecting?.promise !== promise) return;
      reconnecting = null;
      if (again) void reconnected();
    });
    reconnecting = { promise, generation };
    return promise;
  }

  /** محاولات التأكيد بتباعد يكبر ما دامت الجلسة ما تأكّدت (حلقة وحدة بالمرّة). */
  function armRetry(): void {
    if (retrying) return;
    retrying = true;
    void (async () => {
      let delay = RETRY_FIRST_MS;
      try {
        while (unconfirmed(store.get())) {
          await deps.wait(delay);
          if (!unconfirmed(store.get())) break;
          await reconnected().catch(() => {
            /* swallow-ok: التأكيد يحطّ نتيجته بالحالة، والحلقة تعيد بتباعد أكبر ما دامت ما تأكّدت */
          });
          delay = Math.min(delay * 2, RETRY_MAX_MS);
        }
      } finally {
        retrying = false;
      }
    })();
  }

  store.subscribe(() => {
    if (unconfirmed(store.get())) armRetry();
  });

  function apply(result: WorkspaceResult, ticket: Ticket): boolean {
    const owner = ownerOf(result);
    if (ticket.epoch !== epoch || ticket.userId !== owner || userOf(store.get()) !== owner) return false;
    settle(result);
    return true;
  }

  /** دخل (بهذا التبويب، أو بغيره، أو دخول كمل بعد مهلته): الشاشة تبطّل لحد ما الخادم يأكّد صاحب التوكن. */
  function follow(userId: string): Promise<void> {
    epoch += 1;
    lastHolder = userId;
    store.set({ status: 'loading' });
    return confirm(userId);
  }

  return {
    boot,

    signedIn: follow,

    refresh,

    async left() {
      const userId = userOf(store.get());
      if (userId) await persist(() => deps.forget(userId));
      await refresh();
    },

    reconnected,

    begin() {
      return { epoch, userId: userOf(store.get()) };
    },

    apply,

    applyAccept(result, ticket) {
      if (result.ok) apply(result.result, ticket);
      return result;
    },

    signOut() {
      return close(userOf(store.get()), false, false);
    },

    authChanged(event, userId) {
      const state = store.get();
      const current = userOf(state);
      if (event === 'SIGNED_OUT') {
        if (state.status === 'signed_out' && !lastHolder) return;
        const who = current ?? lastHolder;
        lastHolder = null;
        if (who) void persist(() => deps.forget(who));
        if (state.status === 'signed_out') return;
        if (state.status === 'loading' && booting === generation) {
          signedOutWhileBooting = true;
          return;
        }
        epoch += 1;
        generation += 1;
        store.set({ status: 'signed_out', expired: false });
        return;
      }
      if (closing > 0 || (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED') || !userId) return;
      if (event === 'SIGNED_IN' && state.status === 'signed_out') {
        // دخول ما انتظرناه: كمل بعد ما مهلته رجّعت «نتيجة غير معروفة»، أو بتبويب ثاني. الجهاز صار بيه توكنه، فالشاشة
        // تتبعه بدل ما تبقى على «الدخول» والفتح الجاي يدخل بحسابه (FOUNDATION ٢٢٨).
        void follow(userId);
        return;
      }
      if (!current) return;
      if (userId !== current) {
        // تبويب ثاني دخل بحساب ثاني (التخزين مشترك): هذا التبويب يبطّل شاشة الأوّل ويتبعه.
        void follow(userId);
      } else {
        void reconnected();
      }
    },
  };
}
