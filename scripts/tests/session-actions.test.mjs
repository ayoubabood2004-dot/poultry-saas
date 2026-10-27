// أفعال الجلسة (src/lib/session.tsx) بالشفرة الحقيقية ويّا lib/repo والهويّة المحفوظة مزيّفة: الحساب الجديد اللي
// ما تفعّل ما يتأكّد (ولا يبين «انتهت الجلسة»)، التذكرة تنأخذ قبل الإرسال، الخروج من المنشأة يمسح المحفوظة قبل
// التأكيد، فشل التحديث بعد رفض الدعوة ما يطيّح الشاشة، وحزمة ما انحمّلت بالإقلاع = صفحة الفشل مو تحميل للأبد.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const FAKE_REPO = `
const r = () => globalThis.__repo;
export const auth = {
  probeSession: (quick) => r().probe(quick),
  signOutLocal: async () => { r().calls.push('signOutLocal'); },
  onAuthChange: () => () => {},
};
export const workspace = {
  loadMyWorkspace: () => { r().calls.push('load'); return r().load(); },
  createMyOrg: (org, name) => r().createOrg(org, name),
  acceptInviteCode: (member, code) => r().accept(member, code),
  declineInvite: async (member) => { r().calls.push('decline:' + member); },
  declineAndBlock: async (member) => { r().calls.push('block:' + member); },
  leaveMyOrg: async () => { r().calls.push('leave'); },
};`;

const FAKE_SIGNIN = `
const r = () => globalThis.__repo;
export const signIn = (phone, password) => r().signIn(phone, password);
export const signUp = (phone, password) => r().signUp(phone, password);`;

const FAKE_IDENTITY = `
const r = () => globalThis.__repo;
export async function loadIdentity(userId) { return r().saved.get(userId) ?? null; }
export async function saveIdentity(workspace) { r().saved.set(workspace.userId, workspace); }
export async function forgetIdentity(userId) { r().calls.push('forget:' + userId); r().saved.delete(userId); }`;

function fakes(brokenFlow) {
  return {
    name: 'fake-session-deps',
    setup(b) {
      b.onResolve({ filter: /^\.\/(repo|repo\/signin|identity|sessionFlow)$/ }, (args) => {
        const which = args.path.slice(2);
        if (which === 'sessionFlow' && !brokenFlow) return undefined;
        return { path: which, namespace: 'fake-session-deps' };
      });
      b.onLoad({ filter: /.*/, namespace: 'fake-session-deps' }, (args) => ({
        contents:
          args.path === 'repo'
            ? FAKE_REPO
            : args.path === 'repo/signin'
              ? FAKE_SIGNIN
              : args.path === 'identity'
              ? FAKE_IDENTITY
              : "throw new TypeError('Failed to fetch dynamically imported module');",
        loader: 'js',
      }));
    },
  };
}

async function bundle(brokenFlow) {
  const result = await build({
    stdin: { contents: "export { session, sessionStore } from './src/lib/session.tsx'; export * from './src/lib/errors.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: {
      'import.meta.env': '{"VITE_SUPABASE_URL":"https://test.supabase.co","VITE_SUPABASE_PUBLISHABLE_KEY":"sb_publishable_test"}',
      __APP_VERSION__: '"test"',
      'process.env.NODE_ENV': '"production"',
    },
    plugins: [fakes(brokenFlow)],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const ws = (userId) => ({
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
});
const noOrg = (userId) => ({ kind: 'no_org', account: { userId, phone: '9647701234567', invites: [], confirmedAt: 1 } });

function freshRepo(over = {}) {
  return {
    calls: [],
    saved: new Map(),
    probe: async () => ({ kind: 'signed_in', userId: 'u-1' }),
    signIn: async () => 'u-1',
    signUp: async () => ({ userId: 'u-1', signedIn: false }),
    load: async () => noOrg('u-1'),
    createOrg: async () => ({ kind: 'member', workspace: ws('u-1') }),
    accept: async () => ({ ok: true, result: { kind: 'member', workspace: ws('u-1') } }),
    ...over,
  };
}

export default async function (t) {
  const m = await bundle(false);
  t.eq(m.sessionStore.get().status, 'loading', 'بمفاتيح: الجلسة تبدي «جارٍ التحقّق»');

  // حساب جديد والدخول به ينتظر تفعيله (Confirm email): ما يتأكّد بلا جلسة.
  globalThis.__repo = freshRepo();
  const created = await m.session.signUp('07701234567', 'secret123');
  t.same([created.signedIn, globalThis.__repo.calls.includes('load'), m.sessionStore.get().status], [false, false, 'loading'], 'حساب ما تفعّل: بلا my_workspace، فما يبين «انتهت الجلسة»');
  globalThis.__repo = freshRepo({ signUp: async () => ({ userId: 'u-1', signedIn: true }) });
  await m.session.signUp('07701234567', 'secret123');
  t.eq(m.sessionStore.get().status, 'no_org', 'حساب جديد ودخل: يتأكّد ويوصل «أوّل دخول»');

  // التذكرة قبل الإرسال: الخروج والطلب بالطريق.
  let answer;
  globalThis.__repo.createOrg = () => new Promise((resolve) => (answer = resolve));
  const creating = m.session.createOrg('مزرعة', 'س');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await m.session.signOut();
  answer({ kind: 'member', workspace: ws('u-1') });
  await creating;
  await new Promise((resolve) => setTimeout(resolve, 0));
  t.same([m.sessionStore.get().status, globalThis.__repo.saved.has('u-1')], ['signed_out', false], 'إنشاء المنشأة رجع بعد الخروج: ما يرجّعها ولا يحفظ هويّتها');
  // نفس الحساب رجع دخل والجواب القديم وصل بعدها: التذكرة من الدخلة القديمة (لو انأخذت بعد الجواب لانطبق).
  globalThis.__repo = freshRepo();
  await m.session.signIn('07701234567', 'secret123');
  globalThis.__repo.createOrg = () => new Promise((resolve) => (answer = resolve));
  const late = m.session.createOrg('مزرعة', 'س');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await m.session.signOut();
  await m.session.signIn('07701234567', 'secret123');
  answer({ kind: 'member', workspace: ws('u-1') });
  await late;
  t.eq(m.sessionStore.get().status, 'no_org', 'دخل من جديد قبل ما يرجع الجواب: الحالة من تأكيد الدخلة الجديدة');

  // الخروج من المنشأة: المحفوظة تنمسح قبل التأكيد.
  globalThis.__repo = freshRepo({ load: async () => ({ kind: 'member', workspace: ws('u-1') }) });
  await m.session.signIn('07701234567', 'secret123');
  await new Promise((resolve) => setTimeout(resolve, 0));
  t.ok(globalThis.__repo.saved.has('u-1'), 'داخل: الهويّة محفوظة');
  globalThis.__repo.load = async () => Promise.reject(new m.UnknownOutcomeError());
  await m.session.leaveOrg();
  const calls = globalThis.__repo.calls;
  t.ok(calls.indexOf('forget:u-1') > calls.indexOf('leave') && calls.lastIndexOf('load') > calls.indexOf('forget:u-1'), 'leave ثم مسح المحفوظة ثم التأكيد');
  t.eq(m.sessionStore.get().status, 'failed', 'التأكيد ما وصل: ما يرجع للمنشأة اللي طلع منها');

  // رفض دعوة انحفظ والتحديث بعده فشل: الشاشة تبقى.
  globalThis.__repo = freshRepo();
  await m.session.signIn('07701234567', 'secret123');
  t.eq(m.sessionStore.get().status, 'no_org', 'بلا منشأة');
  globalThis.__repo.load = async () => Promise.reject(new m.UnknownOutcomeError());
  await m.session.declineInvite('m-9');
  t.same([globalThis.__repo.calls.includes('decline:m-9'), m.sessionStore.get().status], [true, 'no_org'], 'الرفض انحفظ والتحديث ما وصل: لا رمية ولا صفحة فشل');

  // حزمة sessionFlow ما انحمّلت بالإقلاع.
  const broken = await bundle(true);
  globalThis.__repo = freshRepo();
  await broken.session.boot();
  t.eq(broken.sessionStore.get().status, 'failed', 'حزمة الجلسة ما انحمّلت: صفحة الفشل بزرّها، مو «جارٍ التحقّق» للأبد');
}
