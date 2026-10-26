import { useEffect, type ReactNode } from 'react';
import type { AcceptResult } from '../domain/workspace';
import { hasBackend } from './env';
import { onlineStore } from './online';
import { recoverFromStaleShell } from './pwa/recovery';
import type { SessionController, SessionDeps, SessionState } from './sessionFlow';
import { createStore, useStore } from './store';

// المنشأة الحالية يؤكّدها الخادم (my_workspace())، والمفتاح المحلّي لتسمية خبيئات الجهاز بس:
// بـdoctorVet الواجهة والخادم اختلفوا على «بأي عيادة أنا»، فنزلت بيانات عيادة بعيادة غيرها.
// lib/repo يتحمّل بـimport() هنا: حزمة الإقلاع تبقى بلا Supabase، والقشرة ترسم قبل ما تكمل الجلسة.

export type { SessionState } from './sessionFlow';
export type { Invite, NoOrgAccount, Workspace } from '../domain/workspace';

const repo = () => import('./repo');
// الهويّة المحفوظة (IndexedDB) هم كسولة: الإقلاع بالنت ما يحتاجها قبل جواب الخادم.
const identity = () => import('./identity');

export const sessionStore = createStore<SessionState>(hasBackend() ? { status: 'loading' } : { status: 'not_configured' });

const deps: SessionDeps = {
  probe: async (quick) => (await repo()).auth.probeSession(quick),
  loadWorkspace: async () => (await repo()).workspace.loadMyWorkspace(),
  signOutLocal: async () => (await repo()).auth.signOutLocal(),
  loadSaved: async (userId) => (await identity()).loadIdentity(userId),
  save: async (workspace) => (await identity()).saveIdentity(workspace),
  forget: async (userId) => (await identity()).forgetIdentity(userId),
  online: () => onlineStore.get(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// المتحكّم نفسه كسول هم: القشرة تقرا المخزن بس، والمنطق يجي ويّا lib/repo بأوّل إقلاع.
// حزمته ما انحمّلت (نشر جديد أو شبكة): المحاولة الجاية تعيد التحميل، والتعافي يفحص القشرة مثل page().
let pendingController: Promise<SessionController> | null = null;
function controller(): Promise<SessionController> {
  pendingController ??= import('./sessionFlow').then(
    ({ createSessionController }) => createSessionController(sessionStore, deps),
    (error: unknown) => {
      pendingController = null;
      recoverFromStaleShell();
      throw error;
    },
  );
  return pendingController;
}

function userOf(state: SessionState): string | null {
  if (state.status === 'ready') return state.workspace.userId;
  if (state.status === 'no_org') return state.account.userId;
  return state.status === 'failed' ? state.userId : null;
}

/** الإقلاع ما يبقى «جارٍ التحقّق» للأبد: أي رمية (حزمة ما انحمّلت) = صفحة الفشل بزرّها. */
async function boot(): Promise<void> {
  try {
    await (await controller()).boot();
  } catch (error) {
    sessionStore.set({ status: 'failed', error, userId: userOf(sessionStore.get()) });
  }
}

/** أفعال الجلسة للشاشات. الأخطاء ترجع للشاشة (تعرضها بـdescribeError)؛ الحالة تتبدّل هنا بس. */
export const session = {
  boot,
  refresh: async () => (await controller()).refresh(),
  signOut: async () => (await controller()).signOut(),

  async signIn(phone: string, password: string): Promise<void> {
    const userId = await (await repo()).auth.signIn(phone, password);
    await (await controller()).signedIn(userId);
  },

  /** signedIn خطأ: الحساب انخلق والدخول به ينتظر تفعيله بالمشروع (Confirm email). */
  async signUp(phone: string, password: string): Promise<{ signedIn: boolean }> {
    const { userId, signedIn } = await (await repo()).auth.signUp(phone, password);
    if (signedIn && userId) await (await controller()).signedIn(userId);
    return { signedIn };
  },

  /** التذكرة قبل الإرسال: جواب يوصل بعد خروج أو دخول بحساب ثاني ينرمي (sessionFlow). */
  async createOrg(orgName: string, displayName: string): Promise<void> {
    const current = await controller();
    const ticket = current.begin();
    current.apply(await (await repo()).workspace.createMyOrg(orgName, displayName), ticket);
  },

  async acceptInvite(memberId: string, code: string): Promise<AcceptResult> {
    const current = await controller();
    const ticket = current.begin();
    return current.applyAccept(await (await repo()).workspace.acceptInviteCode(memberId, code), ticket);
  },

  /** الرفض انحفظ؛ فشل التحديث بعده يبقي الشاشة (الدعوة تختفي بالتحديث الجاي). */
  async declineInvite(memberId: string): Promise<void> {
    await (await repo()).workspace.declineInvite(memberId);
    await quietRefresh();
  },

  async declineAndBlock(memberId: string): Promise<void> {
    await (await repo()).workspace.declineAndBlock(memberId);
    await quietRefresh();
  },

  /** الخروج انحفظ: الهويّة المحفوظة تنمسح قبل التأكيد (sessionFlow.left). */
  async leaveOrg(): Promise<void> {
    await (await repo()).workspace.leaveMyOrg();
    await (await controller()).left();
  },

};

async function quietRefresh(): Promise<void> {
  try {
    await (await controller()).refresh();
  } catch {
    /* swallow-ok: العملية نفسها انحفظت؛ refresh من «بلا منشأة» يرمي فشل الشبكة بس ويبقي الشاشة كما هي */
  }
}

/**
 * يبدي الجلسة مرّة وحدة ويسمع تغيّرها (خروج أو دخول بتبويب ثاني، تجديد التوكن). جلسة انفتحت بلا تأكيد (بلا نت)
 * تتأكّد لمّا يرجع الاتصال أو ينفتح التطبيق من الخلفية.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!hasBackend()) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    void boot();
    Promise.all([repo(), controller()]).then(
      ([module, current]) => {
        if (cancelled) return;
        unsubscribe = module.auth.onAuthChange((event, userId) => current.authChanged(event, userId));
      },
      () => {
        /* swallow-ok: بلا اشتراك بتغيّر الجلسة؛ الإقلاع نفسه يعرض حالته، والتبويب يتبع غيره بأوّل طلب */
      },
    );
    const reconnect = () => {
      if (!pendingController) return;
      pendingController
        .then((current) => current.reconnected())
        .catch(() => {
          /* swallow-ok: التأكيد يحطّ نتيجته بالحالة بنفسه؛ هنا بس حزمة ما انحمّلت، والمحاولة الجاية تعيدها */
        });
    };
    const stopOnline = onlineStore.subscribe(() => {
      if (onlineStore.get()) reconnect();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') reconnect();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      unsubscribe?.();
      stopOnline();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return <>{children}</>;
}

export function useSession(): SessionState {
  return useStore(sessionStore);
}
