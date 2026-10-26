// حالة الجلسة (src/lib/sessionFlow.ts) بلا شبكة ولا متصفّح: الخادم يحسم المنشأة، فشل الشبكة ما يطلّع أحداً (يفتح
// بالهويّة المحفوظة لصاحب التوكن نفسه)، رفض الهويّة بس يرجّع للدخول، وجواب قديم ما يدوس حالة أحدث
// (FOUNDATION ٢٠٣، ٢١٧، ٢٢٨). والشريط يتبع علامات الخادم مو الدور وحده.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function bundle(contents) {
  const result = await build({
    stdin: { contents, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const ws = (userId, extra = {}) => ({
  userId,
  orgId: 'o-1',
  orgName: 'مزرعة الأمل',
  memberId: `m-${userId}`,
  displayName: 'س',
  phone: null,
  role: 'owner',
  scopes: [],
  divisions: ['broiler'],
  canSeeCost: true,
  canSeeAccounts: true,
  canSeeSales: true,
  invites: [],
  subscription: 'unknown',
  confirmedAt: 1,
  ...extra,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ticks = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await settle();
};

export default async function (t) {
  const m = await bundle(
    "export * from './src/lib/sessionFlow.ts'; export * from './src/lib/errors.ts'; export { createStore } from './src/lib/store.ts'; export { visibleNav } from './src/lib/nav.ts';",
  );

  function setup(over = {}) {
    const calls = [];
    const saved = over.savedMap ?? new Map(over.saved ?? []);
    const deps = {
      probe: async (quick) => {
        calls.push(`probe:${quick}`);
        return (over.probe ?? (async () => ({ kind: 'signed_in', userId: 'u-1' })))(quick);
      },
      loadWorkspace: over.loadWorkspace ?? (async () => ({ kind: 'member', workspace: ws('u-1') })),
      signOutLocal: async () => {
        calls.push('signOutLocal');
      },
      loadSaved:
        over.loadSaved ??
        (async (userId) => {
          calls.push(`loadSaved:${userId}`);
          return saved.get(userId) ?? null;
        }),
      save: async (workspace) => {
        calls.push(`save:${workspace.userId}`);
        saved.set(workspace.userId, workspace);
      },
      forget: async (userId) => {
        calls.push(`forget:${userId}`);
        saved.delete(userId);
      },
      online: () => over.online ?? true,
      // المهلة القصيرة ما تخلص بالفحوص إلا لمّا الفحص يطلقها بيده.
      wait: over.wait ?? (() => new Promise(() => {})),
    };
    const store = m.createStore({ status: 'loading' });
    return { store, calls, deps, controller: m.createSessionController(store, deps) };
  }

  // ── الإقلاع ─────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = setup({ probe: async () => Promise.reject(new m.NotConnectedError()) });
    await s.controller.boot();
    t.eq(s.store.get().status, 'not_configured', 'بلا مفاتيح القاعدة: هيكل «دون قاعدة بيانات»');
  }
  {
    const s = setup({ probe: async () => ({ kind: 'signed_out', previousUserId: null }) });
    await s.controller.boot();
    t.same(s.store.get(), { status: 'signed_out', expired: false }, 'بلا جلسة وبلا خطأ: خرج فعلاً');
  }
  {
    // C3: كان بالجهاز توكن والخادم أنهى جلسته: هويّته المحفوظة تنمسح والدخول يكول «انتهت».
    const s = setup({ probe: async () => ({ kind: 'signed_out', previousUserId: 'u-1' }), saved: [['u-1', ws('u-1')]] });
    await s.controller.boot();
    t.same([s.store.get().status, s.store.get().expired, s.calls.includes('forget:u-1')], ['signed_out', true, true], 'جلسة أنهاها الخادم: «انتهت الجلسة» وهويّتها تنمسح');
  }
  {
    // C3: SIGNED_OUT المؤجّل لنهاية initialize يسبق الإقلاع للحالة: «انتهت» تبقى.
    let release;
    const s = setup({ probe: () => new Promise((resolve) => (release = resolve)) });
    const booting = s.controller.boot();
    await settle();
    release({ kind: 'signed_out', previousUserId: 'u-1' });
    s.controller.authChanged('SIGNED_OUT', null);
    await booting;
    await ticks();
    t.same(s.store.get(), { status: 'signed_out', expired: true }, 'SIGNED_OUT سبق الإقلاع: «انتهت الجلسة» ما تضيع');
  }
  {
    const s = setup();
    await s.controller.boot();
    const state = s.store.get();
    t.same([state.status, state.workspace?.userId, state.offline], ['ready', 'u-1', false], 'داخل وعضو: جاهز بتأكيد الخادم');
    await settle();
    t.ok(s.calls.includes('save:u-1'), 'الهويّة المؤكّدة تنحفظ للإقلاع بلا نت');
  }
  {
    const s = setup({ loadWorkspace: async () => ({ kind: 'no_org', account: { userId: 'u-1', phone: '9647701234567', invites: [], confirmedAt: 1 } }) });
    await s.controller.boot();
    t.same([s.store.get().status, s.store.get().account?.phone], ['no_org', '9647701234567'], 'داخل بلا منشأة: أوّل دخول برقمه');
    t.ok(!s.calls.some((c) => c.startsWith('save:')), 'بلا منشأة ماكو هويّة تنحفظ');
    await settle();
    t.ok(s.calls.includes('forget:u-1'), 'وجواب «بلا منشأة» يمسح المحفوظة (التحديث يستبدل نسخة الجهاز)');
  }

  // ── الشبكة ما تطلّع أحداً ─────────────────────────────────────────────────────────────────────────────
  {
    const s = setup({ loadWorkspace: async () => Promise.reject(new m.NetworkError()), saved: [['u-1', ws('u-1')]] });
    await s.controller.boot();
    const state = s.store.get();
    t.same([state.status, state.offline], ['ready', true], 'بلا نت ويّا هويّة محفوظة: يفتح بيها');
    t.ok(!s.calls.includes('signOutLocal'), 'فشل الشبكة ما يطلّع المستخدم');
  }
  {
    const s = setup({ loadWorkspace: async () => Promise.reject(new m.UnknownOutcomeError()) });
    await s.controller.boot();
    t.same([s.store.get().status, s.store.get().userId], ['failed', 'u-1'], 'بلا نت وبلا هويّة محفوظة: «أعد المحاولة»، مو خروج');
    t.ok(!s.calls.includes('signOutLocal'), 'ولا هنا خروج');
  }
  {
    const s = setup({ probe: async () => ({ kind: 'offline', userId: 'u-1' }), saved: [['u-1', ws('u-1')]], online: false });
    await s.controller.boot();
    t.same([s.store.get().status, s.store.get().offline], ['ready', true], 'توكن منتهٍ بلا نت: الهويّة المحفوظة لصاحب التوكن');
  }
  {
    // متّصل والفحص رجع «بلا نت» لأن التجديد بطيء: يتأكّد فوراً، مو بأوّل حدث (C2 بالمراجعة الثانية).
    const s = setup({ probe: async () => ({ kind: 'offline', userId: 'u-1' }), saved: [['u-1', ws('u-1', { role: 'manager' })]], loadWorkspace: async () => ({ kind: 'member', workspace: ws('u-1', { role: 'viewer' }) }) });
    await s.controller.boot();
    await ticks();
    t.same([s.store.get().offline, s.store.get().workspace.role], [false, 'viewer'], 'متّصل: الهويّة المحفوظة تنفتح والتأكيد يبدي بلا انتظار حدث');
  }
  {
    const s = setup({ probe: async () => ({ kind: 'offline', userId: 'u-1' }), saved: [['u-2', ws('u-2')]] });
    await s.controller.boot();
    t.eq(s.store.get().status, 'failed', 'هويّة محفوظة لمستخدم ثاني ما تنفتح لصاحب هذا التوكن');
    t.ok(s.store.get().error instanceof m.NetworkError, 'وسببها «ما وصلنا للخادم»');
    t.same(s.calls.filter((c) => c.startsWith('probe:')), ['probe:true', 'probe:false'], 'متّصل وبلا هويّة محفوظة: الفحص يعاد بمهلته الكاملة');
  }
  {
    const s = setup({ probe: async () => ({ kind: 'offline', userId: 'u-1' }), online: false });
    await s.controller.boot();
    t.same([s.store.get().status, s.calls.filter((c) => c.startsWith('probe:')).length], ['failed', 1], 'بلا نت وبلا هويّة محفوظة: فشل فوراً، بلا انتظار ثاني');
  }
  {
    const s = setup({ probe: async (quick) => (quick ? { kind: 'offline', userId: 'u-1' } : { kind: 'signed_in', userId: 'u-1' }) });
    await s.controller.boot();
    t.same([s.store.get().status, s.store.get().offline], ['ready', false], 'تجديد بطيء بالنت وبلا هويّة محفوظة: ينتظر ويتأكّد');
  }
  {
    // F2: حزمة الهويّة ما انحمّلت: الإقلاع ما يوكف على «جارٍ التحقّق».
    const s = setup({
      probe: async () => ({ kind: 'offline', userId: 'u-1' }),
      online: false,
      loadSaved: async () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    });
    await s.controller.boot();
    t.eq(s.store.get().status, 'failed', 'قراءة الهويّة المحفوظة رمت: صفحة الفشل، مو تحميل للأبد');
  }

  {
    // فحص بطيء رمى بعد ما الشخص دخل: فشله القديم ما يدوس الدخول.
    let fail;
    const s = setup({ probe: () => new Promise((_, reject) => (fail = reject)) });
    const booting = s.controller.boot();
    await settle();
    await s.controller.signedIn('u-1');
    fail(new TypeError('boom'));
    await booting;
    t.eq(s.store.get().status, 'ready', 'فشل فحص قديم ما يطلّع اللي دخل لصفحة الفشل');
  }

  {
    // SIGNED_OUT وصل والإقلاع يقرا الهويّة المحفوظة: ما تنفتح بلا توكن.
    let release;
    const s = setup({
      probe: async () => ({ kind: 'offline', userId: 'u-1' }),
      online: false,
      loadSaved: () => new Promise((resolve) => (release = resolve)),
    });
    const booting = s.controller.boot();
    await ticks();
    s.controller.authChanged('SIGNED_OUT', null);
    release(ws('u-1'));
    await booting;
    t.same(s.store.get(), { status: 'signed_out', expired: false }, 'خرج بتبويب ثاني والإقلاع يقرا المحفوظة: خارج، مو منشأة بلا توكن');
  }

  // ── الخروج ورفض الهويّة يحسمون (C1) ──────────────────────────────────────────────────────────────────
  {
    let release;
    let loads = 0;
    let answer;
    const s = setup({
      saved: [['u-1', ws('u-1')]],
      wait: (ms) => (ms === m.QUICK_OPEN_MS ? Promise.resolve() : new Promise(() => {})),
      loadWorkspace: () => {
        loads += 1;
        return loads === 1 ? new Promise((resolve, reject) => (answer = reject)) : Promise.reject(new m.NetworkError());
      },
    });
    s.deps.signOutLocal = () => new Promise((resolve) => (release = resolve));
    const booting = s.controller.boot();
    await ticks();
    t.same([s.store.get().status, s.store.get().offline], ['ready', true], 'الفتح السريع بالمحفوظة');
    answer(new m.IdentityError('not_signed_in'));
    await ticks();
    t.eq(s.store.get().status, 'loading', 'رفض الهويّة: الشاشة تبطّل فوراً، ما تبقى بمنشأة الحساب المرفوض');
    s.controller.authChanged('TOKEN_REFRESHED', 'u-1');
    await s.controller.reconnected();
    await s.controller.refresh();
    t.eq(loads, 1, 'وتأكيد ما يبدأ والخروج بالطريق');
    release();
    await booting;
    await ticks();
    t.same([s.store.get(), s.calls.includes('forget:u-1')], [{ status: 'signed_out', expired: true }, true], 'وينتهي «انتهت الجلسة» والمحفوظة ممسوحة');
  }

  {
    // خروج بإيده (الشاشة ما تبطّل) ورجع الاتصال بنصّه: ما يبدأ تأكيد يرجّع صفحة فشل أو المنشأة.
    let release;
    let loads = 0;
    const s = setup({
      probe: async () => ({ kind: 'offline', userId: 'u-1' }),
      saved: [['u-1', ws('u-1')]],
      online: false,
      loadWorkspace: async () => {
        loads += 1;
        throw new m.NetworkError();
      },
    });
    await s.controller.boot();
    s.deps.signOutLocal = () => new Promise((resolve) => (release = resolve));
    s.deps.online = () => true;
    const leaving = s.controller.signOut();
    await settle();
    await s.controller.reconnected();
    t.eq(loads, 0, 'الخروج بالطريق: رجوع الاتصال ما يبدأ تأكيداً');
    release();
    await leaving;
    t.same(s.store.get(), { status: 'signed_out', expired: false }, 'وينتهي خارجاً');
  }

  // ── دخول كمل بعد مهلته، أو بتبويب ثاني (C4، C11) ─────────────────────────────────────────────────────
  {
    const s = setup({ probe: async () => ({ kind: 'signed_out', previousUserId: null }) });
    await s.controller.boot();
    s.controller.authChanged('SIGNED_IN', 'u-1');
    await ticks();
    t.same([s.store.get().status, s.store.get().workspace?.userId], ['ready', 'u-1'], 'الشاشة على «الدخول» والجهاز صار بيه توكن: تتبعه');
    const out = setup({ probe: async () => ({ kind: 'signed_out', previousUserId: null }) });
    await out.controller.boot();
    out.controller.authChanged('TOKEN_REFRESHED', 'u-1');
    await ticks();
    t.eq(out.store.get().status, 'signed_out', 'تجديد توكن بلا دخول ما يدخّل أحداً');
  }

  // ── تأكيد بتباعد لمّا ماكو حدث (واي فاي القاعة، C2) ───────────────────────────────────────────────────
  {
    let tick;
    let up = false;
    const s = setup({
      probe: async () => ({ kind: 'offline', userId: 'u-1' }),
      saved: [['u-1', ws('u-1')]],
      wait: (ms) => (ms === m.RETRY_FIRST_MS ? new Promise((resolve) => (tick = resolve)) : new Promise(() => {})),
      loadWorkspace: async () => (up ? { kind: 'member', workspace: ws('u-1') } : Promise.reject(new m.NetworkError())),
    });
    await s.controller.boot();
    await ticks();
    t.same([s.store.get().offline, typeof tick], [true, 'function'], 'متّصل والخادم ما وصل: محاولة مؤجّلة');
    up = true;
    tick();
    await ticks();
    t.eq(s.store.get().offline, false, 'بعد المهلة يتأكّد بلا حدث online ولا تجديد');
  }

  // ── الفتح السريع بشبكة بطيئة ──────────────────────────────────────────────────────────────────────────
  {
    let release;
    let answer;
    const s = setup({
      saved: [['u-1', ws('u-1', { role: 'manager' })]],
      wait: () => new Promise((resolve) => (release = resolve)),
      loadWorkspace: () => new Promise((resolve) => (answer = resolve)),
    });
    const booting = s.controller.boot();
    await settle();
    t.eq(s.store.get().status, 'loading', 'قبل المهلة القصيرة: ينتظر الخادم');
    release();
    await settle();
    t.same([s.store.get().status, s.store.get().offline, s.store.get().workspace?.role], ['ready', true, 'manager'], 'بعدها: الهويّة المحفوظة تنفتح بلا تأكيد');
    answer({ kind: 'member', workspace: ws('u-1', { role: 'viewer' }) });
    await booting;
    t.same([s.store.get().offline, s.store.get().workspace.role], [false, 'viewer'], 'والجواب المتأخّر يحسم (الخادم يغلب المحفوظ)');
  }
  {
    let release;
    let answer;
    const s = setup({ wait: () => new Promise((resolve) => (release = resolve)), loadWorkspace: () => new Promise((resolve) => (answer = resolve)) });
    const booting = s.controller.boot();
    await settle();
    release();
    await settle();
    t.eq(s.store.get().status, 'loading', 'بلا هويّة محفوظة: المهلة القصيرة ما تفتح شي');
    answer({ kind: 'member', workspace: ws('u-1') });
    await booting;
    t.eq(s.store.get().status, 'ready', 'والجواب يفتح');
  }

  // ── التأكيد لمّا يرجع الاتصال (S5) ───────────────────────────────────────────────────────────────────
  {
    let up = false;
    const s = setup({
      probe: async () => ({ kind: 'offline', userId: 'u-1' }),
      saved: [['u-1', ws('u-1', { role: 'manager' })]],
      loadWorkspace: async () => (up ? { kind: 'member', workspace: ws('u-1', { role: 'viewer' }) } : Promise.reject(new m.NetworkError())),
    });
    await s.controller.boot();
    t.same([s.store.get().status, s.store.get().offline], ['ready', true], 'انفتح بلا نت');
    up = true;
    s.controller.authChanged('TOKEN_REFRESHED', 'u-1');
    await ticks();
    t.same([s.store.get().offline, s.store.get().workspace.role], [false, 'viewer'], 'تجدّد التوكن (الاتصال رجع): يتأكّد ويتبع الخادم');
  }
  {
    let count = 0;
    let answer;
    const s = setup({
      probe: async () => ({ kind: 'offline', userId: 'u-1' }),
      saved: [['u-1', ws('u-1')]],
      loadWorkspace: () => {
        count += 1;
        return new Promise((resolve) => (answer = resolve));
      },
    });
    await s.controller.boot();
    const first = s.controller.reconnected();
    const second = s.controller.reconnected();
    await settle();
    t.eq(count, 1, 'رجوع الاتصال مرّتين بنفس اللحظة: طلب تأكيد واحد');
    answer({ kind: 'member', workspace: ws('u-1') });
    await Promise.all([first, second]);
    t.eq(s.store.get().offline, false, 'وبعده متأكّد');
    await s.controller.reconnected();
    t.eq(count, 1, 'جلسة متأكّدة: رجوع الاتصال ما يطلب شي');
  }
  {
    const s = setup({ probe: async () => ({ kind: 'offline', userId: 'u-1' }), saved: [['u-1', ws('u-1')]], online: false });
    await s.controller.boot();
    await s.controller.reconnected();
    t.eq(s.store.get().offline, true, 'بعده بلا نت: ما يحاول');
  }

  // ── رفض الهويّة بس يرجّع للدخول ────────────────────────────────────────────────────────────────────────
  {
    const s = setup({ loadWorkspace: async () => Promise.reject(new m.IdentityError('not_signed_in')), saved: [['u-1', ws('u-1')]] });
    await s.controller.boot();
    t.same(s.store.get(), { status: 'signed_out', expired: true }, 'الخادم رفض الهويّة: للدخول بـ«انتهت الجلسة»، حتى ويّا هويّة محفوظة');
    t.ok(s.calls.includes('signOutLocal'), 'والجلسة المحلّية تنمسح');
    t.ok(s.calls.includes('forget:u-1'), 'والهويّة المحفوظة هم (جهاز مشترك)');
  }
  {
    const s = setup({ loadWorkspace: async () => ({ kind: 'member', workspace: ws('u-other') }) });
    await s.controller.boot();
    t.same([s.store.get().status, s.store.get().error?.code], ['failed', 'user_mismatch'], 'الفحص والخادم مختلفين بالإقلاع: ما يفتح بهويّة غيره');
    t.ok(!s.calls.includes('signOutLocal'), 'ولا يطلّع صاحب التوكن (جلسته صالحة)');
  }
  {
    // C0: تبويب ثاني دخل بـu-2 والتحديث هنا انطلق لـu-1: الخادم يجاوب لصاحب التوكن، فالتبويب يتبعه بلا خروج.
    let holder = 'u-1';
    const s = setup({
      probe: async () => ({ kind: 'signed_in', userId: holder }),
      loadWorkspace: async () => ({ kind: 'member', workspace: ws(holder) }),
    });
    await s.controller.boot();
    holder = 'u-2';
    await s.controller.refresh();
    await ticks();
    t.same([s.store.get().status, s.store.get().workspace?.userId, s.calls.includes('signOutLocal')], ['ready', 'u-2', false], 'تحديث بتوكن تبدّل: يتبع صاحب التوكن، وما يلغي جلسته');
  }
  {
    // C0: دخول بحساب ثاني يبطّل شاشة الأوّل فوراً، فلا تحديث ولا كتابة بمنشأته بتوكن الثاني.
    let answer;
    const s = setup({ loadWorkspace: () => (answer ? new Promise((resolve) => (answer = resolve)) : { kind: 'member', workspace: ws('u-1') }) });
    await s.controller.boot();
    answer = () => {};
    s.controller.authChanged('SIGNED_IN', 'u-2');
    await settle();
    t.eq(s.store.get().status, 'loading', 'تبويب ثاني دخل بـu-2: شاشة u-1 تنطوي لحد ما الخادم يأكّد');
    answer({ kind: 'member', workspace: ws('u-2') });
    await ticks();
    t.eq(s.store.get().workspace?.userId, 'u-2', 'وتنفتح بـu-2');
  }
  {
    const s = setup({ loadWorkspace: async () => Promise.reject(new m.RejectedError('forbidden', 'x')) });
    await s.controller.boot();
    t.same([s.store.get().status, s.store.get().error?.code], ['failed', 'forbidden'], 'رفض مو هويّة: فشل ظاهر، مو خروج');
  }

  // ── الجواب القديم ما يدوس الأحدث ─────────────────────────────────────────────────────────────────────
  {
    let release;
    const slow = new Promise((resolve) => {
      release = resolve;
    });
    const s = setup({ loadWorkspace: () => slow });
    const booting = s.controller.boot();
    await settle();
    await s.controller.signOut();
    release({ kind: 'member', workspace: ws('u-1') });
    await booting;
    t.same(s.store.get(), { status: 'signed_out', expired: false }, 'خرج وطلب التأكيد بالطريق: جوابه المتأخّر ما يرجّعه داخلاً');
  }
  {
    const s = setup();
    await s.controller.boot();
    await s.controller.signOut();
    t.ok(s.calls.includes('signOutLocal') && s.calls.includes('forget:u-1'), 'الخروج يمسح الجلسة والهويّة المحفوظة لصاحبها');
  }
  {
    // S1: جواب create_my_org متأخّر بعد الخروج ما يرجّع منشأة الأوّل ولا يحفظ هويّته.
    const s = setup({ loadWorkspace: async () => ({ kind: 'no_org', account: { userId: 'u-1', phone: null, invites: [], confirmedAt: 1 } }) });
    await s.controller.boot();
    const ticket = s.controller.begin();
    await s.controller.signOut();
    const before = s.calls.length;
    t.eq(s.controller.apply({ kind: 'member', workspace: ws('u-1') }, ticket), false, 'الجواب المتأخّر ينرمي');
    await settle();
    t.same([s.store.get().status, s.calls.slice(before)], ['signed_out', []], 'الحالة تبقى «خارج» وماكو حفظ');
  }
  {
    const s = setup({ loadWorkspace: async () => ({ kind: 'no_org', account: { userId: 'u-1', phone: null, invites: [], confirmedAt: 1 } }) });
    await s.controller.boot();
    const ticket = s.controller.begin();
    await s.controller.signOut();
    await s.controller.signedIn('u-1');
    t.eq(s.controller.apply({ kind: 'member', workspace: ws('u-1') }, ticket), false, 'حتى لو رجع نفس الحساب دخل: الطلب من دخلة قديمة');
  }
  {
    let who = 'u-1';
    const s = setup({ loadWorkspace: async () => ({ kind: 'no_org', account: { userId: who, phone: null, invites: [], confirmedAt: 1 } }) });
    await s.controller.boot();
    const ticket = s.controller.begin();
    who = 'u-2';
    s.controller.authChanged('SIGNED_IN', 'u-2');
    await settle();
    t.eq(s.controller.apply({ kind: 'member', workspace: ws('u-1') }, ticket), false, 'تبويب ثاني دخل بحساب ثاني: جواب الأوّل ما يفتح منشأته هنا');
    t.eq(s.store.get().account?.userId, 'u-2', 'والتبويب يتبع الحساب الجديد');
  }
  {
    const s = setup({ loadWorkspace: async () => ({ kind: 'no_org', account: { userId: 'u-1', phone: null, invites: [], confirmedAt: 1 } }) });
    await s.controller.boot();
    const ticket = s.controller.begin();
    t.eq(s.controller.apply({ kind: 'member', workspace: ws('u-1') }, ticket), true, 'بلا تبدّل: النتيجة تنطبق');
    await settle();
    t.ok(s.calls.includes('save:u-1'), 'وتنحفظ');
  }

  // ── المحفوظة تتبع الخادم (S3 وUI-1) ──────────────────────────────────────────────────────────────────
  {
    const savedMap = new Map();
    let mode = 'member';
    const loadWorkspace = async () =>
      mode === 'member' ? { kind: 'member', workspace: ws('u-1') } : { kind: 'no_org', account: { userId: 'u-1', phone: null, invites: [], confirmedAt: 1 } };
    const s = setup({ savedMap, loadWorkspace });
    await s.controller.boot();
    await settle();
    mode = 'no_org';
    await s.controller.refresh();
    await settle();
    const next = setup({ savedMap, probe: async () => ({ kind: 'offline', userId: 'u-1' }), online: false });
    await next.controller.boot();
    t.eq(next.store.get().status, 'failed', 'خرج من المنشأة بالنت ثم فتح بلا نت: ما ترجع المنشأة القديمة');
  }
  {
    const savedMap = new Map();
    let mode = 'member';
    const s = setup({ savedMap, loadWorkspace: async () => (mode === 'member' ? { kind: 'member', workspace: ws('u-1') } : Promise.reject(new m.UnknownOutcomeError())) });
    await s.controller.boot();
    await settle();
    mode = 'timeout';
    await s.controller.left();
    t.same([s.store.get().status, savedMap.has('u-1')], ['failed', false], 'خرج والتأكيد بعده ما وصل: ما يرجع للمنشأة اللي طلع منها');
  }
  {
    const s = setup();
    await s.controller.boot();
    s.controller.authChanged('SIGNED_OUT', null);
    await settle();
    t.ok(s.calls.includes('forget:u-1'), 'خروج بتبويب ثاني يمسح المحفوظة هم');
  }

  // ── «تحقّق من الدعوات» بشبكة ضعيفة (UI-3) ────────────────────────────────────────────────────────────
  {
    let fail = false;
    const s = setup({
      loadWorkspace: async () => (fail ? Promise.reject(new m.UnknownOutcomeError()) : { kind: 'no_org', account: { userId: 'u-1', phone: null, invites: [], confirmedAt: 1 } }),
    });
    await s.controller.boot();
    fail = true;
    let thrown = null;
    await s.controller.refresh().catch((error) => (thrown = error));
    t.same([s.store.get().status, thrown instanceof m.UnknownOutcomeError], ['no_org', true], 'الشاشة تبقى والخطأ يرجع لها (المكتوب ما يضيع)');
  }

  // ── تبويب ثاني، والدعوة ──────────────────────────────────────────────────────────────────────────────
  {
    const s = setup();
    await s.controller.boot();
    s.controller.authChanged('SIGNED_OUT', null);
    t.same(s.store.get(), { status: 'signed_out', expired: false }, 'خروج بتبويب ثاني ينعكس هنا');
    s.controller.authChanged('TOKEN_REFRESHED', 'u-1');
    t.eq(s.store.get().status, 'signed_out', 'تجديد التوكن ما يرجّع أحداً');
  }
  {
    const s = setup({ loadWorkspace: async () => ({ kind: 'no_org', account: { userId: 'u-1', phone: null, invites: [], confirmedAt: 1 } }) });
    await s.controller.boot();
    const wrong = s.controller.applyAccept({ ok: false, hint: 'h', triesLeft: 4 }, s.controller.begin());
    t.same([wrong.ok, s.store.get().status], [false, 'no_org'], 'رمز غلط: الحالة ما تتبدّل والشاشة تعرض التلميح');
    s.controller.applyAccept({ ok: true, result: { kind: 'member', workspace: ws('u-1') } }, s.controller.begin());
    t.eq(s.store.get().status, 'ready', 'رمز صحيح: يدخل المنشأة بلا طلب ثاني');
  }
  {
    let mode = 'member';
    const s = setup({
      loadWorkspace: async () =>
        mode === 'member' ? { kind: 'member', workspace: ws('u-1') } : { kind: 'no_org', account: { userId: 'u-1', phone: null, invites: [], confirmedAt: 1 } },
    });
    await s.controller.boot();
    mode = 'no_org';
    await s.controller.refresh();
    t.eq(s.store.get().status, 'no_org', 'بعد الخروج من المنشأة: التأكيد من جديد يرجّعه لأوّل دخول');
  }

  // ── الشريط يتبع الخادم ───────────────────────────────────────────────────────────────────────────────
  const nav = (workspace) => m.visibleNav({ status: 'ready', workspace, offline: false }).map((item) => item.to);
  t.same(
    nav(ws('u-1', { role: 'hall_worker', divisions: ['broiler'], canSeeCost: false, canSeeAccounts: false, canSeeSales: false })),
    ['/', '/broiler', '/account', '/settings'],
    'عامل القاعة: وحدته وحسابه بس، بلا مخازن ولا مبيعات ولا حسابات ولا تقارير ولا موظفين',
  );
  t.ok(nav(ws('u-1')).includes('/staff'), 'المالك يشوف «الموظفون»');
  t.ok(!nav(ws('u-1', { role: 'manager' })).includes('/staff'), 'المدير ما يشوف «الموظفون» (المالك بس)');
  t.ok(!nav(ws('u-1', { role: 'accountant', canSeeAccounts: false })).includes('/accounts'), 'الحسابات تتبع علامة الخادم مو الدور وحده');
  t.eq(m.visibleNav({ status: 'not_configured' }).length, nav(ws('u-1', { divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'] })).length, 'بلا قاعدة: الهيكل كلّه');
}
