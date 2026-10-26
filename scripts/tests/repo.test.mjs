// lib/repo بلا خادم: أخطاء PostgREST وGoTrue تتصنّف لأصناف errors.ts (الرفض برمزه وتلميحه، والهويّة غير الشبكة،
// و«ما وصل» غير «ما نعرف»)، وبلا مفاتيح القاعدة كل طلب «غير مربوط». والهويّة المحفوظة (IndexedDB) لصاحبها بس.
import 'fake-indexeddb/auto';
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

const kindOf = (m, error) =>
  error instanceof m.IdentityError
    ? `identity:${error.code}`
    : error instanceof m.RejectedError
      ? `rejected:${error.code}:${error.hint ?? ''}`
      : error instanceof m.NetworkError
        ? 'network'
        : error instanceof m.UnknownOutcomeError
          ? 'unknown'
          : `other:${error?.message}`;

export default async function (t) {
  const m = await bundle(
    [
      "export { classifyPostgrest, call } from './src/lib/repo/core.ts';",
      "export { mapAuthError, signIn } from './src/lib/repo/auth.ts';",
      "export { loadHomeSummary } from './src/lib/repo/home.ts';",
      "export { getClient } from './src/lib/repo/client.ts';",
      "export * from './src/lib/errors.ts';",
      "export { saveIdentity, loadIdentity, forgetIdentity } from './src/lib/identity.ts';",
      "export { fmtPhone, fmtInviteCode } from './src/lib/format.ts';",
    ].join('\n'),
  );

  // ── PostgREST ─────────────────────────────────────────────────────────────────────────────────────
  const pg = (error, status, kind = 'rpc', online = true) => kindOf(m, m.classifyPostgrest(error, status, kind, online));
  t.eq(pg({ code: 'P0001', message: 'last_owner', hint: 'هذا آخر مالك للمنشأة.' }, 400), 'rejected:last_owner:هذا آخر مالك للمنشأة.', 'الرفض المقصود برمزه وتلميحه');
  t.eq(pg({ code: 'P0001', message: 'forbidden', hint: '' }, 400), 'rejected:forbidden:', 'تلميح فارغ = null (ما يبين سطراً فارغاً)');
  t.eq(pg({ code: 'P0001', message: 'not_signed_in', hint: 'هذا الحساب غير متاح.' }, 400), 'identity:not_signed_in', 'not_signed_in هويّة، مو رفض عادي');
  t.eq(pg({ code: '42501', message: 'permission denied for function my_workspace' }, 401), 'identity:42501', '42501 على دالّة = هويّة');
  t.eq(pg({ code: '42501', message: 'permission denied for function x' }, 403), 'identity:42501', '42501 على دالّة حتى بـ403');
  t.eq(pg({ code: '42501', message: 'new row violates row-level security' }, 403, 'table'), 'rejected:42501:', '42501 على جدول = سياسة RLS، مو هويّة');
  t.eq(pg({ code: 'PGRST301', message: 'JWT expired' }, 401), 'identity:PGRST301', 'توكن منتهٍ = هويّة');
  t.eq(pg({ code: 'PGRST303', message: 'JWT expired' }, 401), 'identity:PGRST303', 'رمز PostgREST الأحدث للتوكن المنتهي');
  t.eq(pg({ message: 'TypeError: Failed to fetch', code: '' }, 0, 'rpc', false), 'network', 'بلا اتصال: ما وصل');
  t.eq(pg({ message: 'TypeError: Failed to fetch', code: '' }, 0, 'rpc', true), 'unknown', 'بالاتصال وما رجع جواب: ما نعرف');
  t.eq(pg({ code: '23505', message: 'duplicate key' }, 409), 'rejected:23505:', 'خطأ قاعدة ثاني: رفض برمزه');
  t.eq(pg({ code: 'PGRST002', message: 'schema cache' }, 503), 'network', 'PostgREST ما وصل القاعدة (PGRST002): الجملة ما تنفّذت، مو «رفض»');
  t.eq(pg({ code: 'PGRST003', message: 'pool timeout' }, 504), 'network', 'PGRST003: ما تنفّذت');
  t.eq(pg({ code: '', message: 'Service Unavailable' }, 503), 'network', '503 بلا رمز: ما تنفّذت');
  t.eq(pg({ code: '', message: 'Bad Gateway' }, 502), 'unknown', '502 من البوّابة: ممكن تنفّذت والجواب ضاع');
  t.eq(pg({ code: '', message: 'Gateway Timeout' }, 504), 'unknown', '504: ما نعرف');
  t.eq(pg({ code: '', message: 'Cloudflare' }, 524), 'unknown', '524 من Cloudflare: ما نعرف');
  t.eq(pg({ code: '57014', message: 'canceling statement' }, 500), 'rejected:57014:', '500 برمز بوستغريس: رفض حقيقي (المعاملة رجعت)');

  // ── GoTrue ────────────────────────────────────────────────────────────────────────────────────────
  const auth = (error, online = true) => kindOf(m, m.mapAuthError(error, online));
  t.ok(auth({ code: 'invalid_credentials', status: 400 }).startsWith('rejected:invalid_credentials:رقم الهاتف أو كلمة السرّ غير صحيحة'), 'الدخول الغلط بالفصحى');
  t.ok(auth({ code: 'user_already_exists', status: 422 }).includes('مسجّل بالفعل'), 'رقم مسجّل');
  t.ok(auth({ code: 'email_not_confirmed', status: 400 }).includes('لم يُفعَّل'), 'حساب ما تفعّل');
  t.ok(auth({ code: 'signup_disabled', status: 422 }).includes('مغلق'), 'التسجيل مغلق');
  t.ok(auth({ code: 'over_request_rate_limit', status: 429 }).includes('محاولات كثيرة'), 'محاولات كثيرة');
  t.eq(auth({ name: 'AuthRetryableFetchError', status: 0 }, false), 'network', 'GoTrue بلا اتصال: ما وصل');
  t.eq(auth({ name: 'AuthRetryableFetchError', status: 0 }, true), 'unknown', 'GoTrue بالاتصال بلا جواب: ما نعرف');
  t.ok(auth({ code: 'mystery', status: 500 }).startsWith('rejected:mystery:تعذّر إتمام الطلب'), 'خطأ مو معروف: تلميح عامّ فصيح، مو «غير متوقّع»');
  t.eq(m.describeError(new m.IdentityError('PGRST301')).title, 'انتهت جلسة الدخول', 'الهويّة تنوصف «انتهت جلسة الدخول»');

  // ── بلا مفاتيح القاعدة ─────────────────────────────────────────────────────────────────────────────
  await t.rejects(m.getClient(), 'بلا مفاتيح: العميل «غير مربوط»', /not_connected/);
  await t.rejects(m.loadHomeSummary(), 'بلا مفاتيح: الرئيسية «غير مربوط»', /not_connected/);
  await t.rejects(m.call('my_workspace'), 'بلا مفاتيح: النداء «غير مربوط»', /not_connected/);
  await t.rejects(m.signIn('12345', 'password1'), 'رقم غلط يرفض قبل أي طلب', /invalid_phone/);

  // ── الهويّة المحفوظة ───────────────────────────────────────────────────────────────────────────────
  const db = `identity-test-${process.pid}`;
  const workspace = { userId: 'u-1', orgId: 'o-1', orgName: 'مزرعة الأمل', role: 'owner' };
  await m.saveIdentity(workspace, db);
  t.same(await m.loadIdentity('u-1', db), workspace, 'الهويّة المؤكّدة ترجع لصاحبها');
  t.eq(await m.loadIdentity('u-2', db), null, 'ولا ترجع لغيره');
  await m.forgetIdentity('u-1', db);
  t.eq(await m.loadIdentity('u-1', db), null, 'الخروج يمسحها');

  // ── عرض الرقم والرمز ───────────────────────────────────────────────────────────────────────────────
  t.eq(m.fmtPhone('9647701234567'), '0770 123 4567', 'الرقم الموحّد بالشكل اللي يكتبه الناس');
  t.eq(m.fmtPhone('15551234567'), '15551234567', 'غير الموحّد كما هو');
  t.eq(m.fmtInviteCode('012345'), '012 345', 'الرمز بثلاثتين والصفر الأوّل باقٍ');
  t.eq(m.classifyPostgrest({ code: 'P0001', message: 'forbidden', hint: '' }, 400, 'rpc', true).hint, null, 'التلميح الفارغ null بالضبط، مو نصّ فارغ');

  await withFakeSupabase(t);
}

// ── بمفاتيح وعميل Supabase مزيّف ───────────────────────────────────────────────────────────────────────
// الحزمة الحقيقية تنبدل بوحدة تبني عملاء يتحكّم بيهم الفحص (globalThis.__fake)، والمفاتيح من globalThis.__TEST_ENV__.

const fakeSupabase = {
  name: 'fake-supabase',
  setup(b) {
    b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'fake', namespace: 'fake-supabase' }));
    b.onLoad({ filter: /.*/, namespace: 'fake-supabase' }, () => ({
      contents: 'export function createClient(url, key, options) { return globalThis.__fake.make(url, key, options); }',
      loader: 'js',
    }));
  },
};

function memoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

const TOKEN_KEY = 'sb-test-auth-token';
const never = () => new Promise(() => {});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeFake() {
  const fake = { clients: [], plan: {} };
  fake.make = (url, key, options) => {
    const subscribers = [];
    const client = {
      url,
      key,
      storage: options.auth.storage,
      calls: [],
      disposed: false,
      auth: {
        getSession: () => (fake.plan.getSession ?? (async () => ({ data: { session: null }, error: null })))(),
        refreshSession: () => {
          client.refreshes = (client.refreshes ?? 0) + 1;
          return (fake.plan.refreshSession ?? (async () => ({ data: { session: null }, error: null })))();
        },
        initialize: () => (fake.plan.initialize ?? (async () => ({ error: null })))(),
        signOut: (scope) => (fake.plan.signOut ?? (async () => ({ error: null })))(scope, client),
        onAuthStateChange: (callback) => {
          subscribers.push(callback);
          return { data: { subscription: { unsubscribe() {} } } };
        },
        dispose: async () => {
          client.disposed = true;
          client.disposals = (client.disposals ?? 0) + 1;
          subscribers.length = 0;
        },
        stopAutoRefresh: async () => {},
      },
      emit: (event, session) => subscribers.forEach((callback) => callback(event, session)),
      rpc: (fn, args) => {
        client.calls.push(fn);
        return (fake.plan.rpc ?? (async () => ({ data: null, error: null, status: 200 })))(fn, args);
      },
      from: (table) => {
        const result = fake.plan.tables?.[table] ?? { data: [], error: null, status: 200 };
        const chain = { select: () => chain, order: () => chain, is: () => chain, then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
        return chain;
      },
    };
    fake.clients.push(client);
    // initialize() يبدي ويّا العميل، ولو الخادم رفض التجديد يمسح الجلسة قبل أي قراءة بعده.
    fake.plan.onCreate?.(client);
    return client;
  };
  return fake;
}

function fakeJwt(payload) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.signature`;
}

// الفحوص كلها بعملية node وحدة: الكائنات العامّة المزيّفة (localStorage وnavigator وwindow) ترجع كما كانت بعد هذا
// القسم، حتى لو فشل، وإلا فحوص بعده (ui وweight-pad وscreens) تلقى window بلا matchMedia.
async function withFakeSupabase(t) {
  const saved = ['localStorage', 'navigator', 'window'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  try {
    await fakeSupabaseChecks(t);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    delete globalThis.__fake;
    delete globalThis.__TEST_ENV__;
  }
}

async function fakeSupabaseChecks(t) {
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true, writable: true });
  const net = { onLine: true };
  Object.defineProperty(globalThis, 'navigator', { value: net, configurable: true, writable: true });
  const win = new EventTarget();
  win.localStorage = globalThis.localStorage;
  globalThis.window = win;
  globalThis.__TEST_ENV__ = { VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
  const fake = makeFake();
  globalThis.__fake = fake;
  const result = await build({
    stdin: {
      contents: [
        "export { call, authed, OFFLINE_SESSION_MS } from './src/lib/repo/core.ts';",
        "export { probeSession, signOutLocal, onAuthChange, QUICK_PROBE_MS } from './src/lib/repo/auth.ts';",
        "export { getClient, dropClient, revocableStorage } from './src/lib/repo/client.ts';",
        "export { loadStaff } from './src/lib/repo/members.ts';",
        "export { backendSettings, isPublishableKey, isProjectUrl } from './src/lib/env.ts';",
        "export * from './src/lib/errors.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env': 'globalThis.__TEST_ENV__', __APP_VERSION__: '"test"' },
    plugins: [fakeSupabase],
  });
  const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const session = (userId) => ({ user: { id: userId }, access_token: 'a', refresh_token: 'r' });
  const storeToken = (userId) => localStorage.setItem(TOKEN_KEY, JSON.stringify(session(userId)));

  // ── المفتاح العامّ بس (S7) ─────────────────────────────────────────────────────────────────────────
  t.ok(m.isPublishableKey('sb_publishable_abc') && m.isPublishableKey(fakeJwt({ role: 'anon' })), 'المفتاح العامّ (الجديد وJWT دوره anon) ينقبل');
  t.ok(!m.isPublishableKey('sb_secret_abc') && !m.isPublishableKey(fakeJwt({ role: 'service_role' })), 'السرّي وservice_role يرفضون');
  const quiet = console.error;
  console.error = () => {};
  globalThis.__TEST_ENV__ = { VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: fakeJwt({ role: 'service_role' }) };
  t.eq(m.backendSettings(), null, 'service_role بمتغيّر العامّ: التطبيق ما يتّصل بيه');
  globalThis.__TEST_ENV__ = { VITE_SUPABASE_URL: 'postgresql://postgres.abc:pw@aws-0.pooler.supabase.com:6543/postgres', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
  t.eq(m.backendSettings(), null, 'رابط اتّصال القاعدة بكلمة سرّها بمتغيّر الرابط: يرفض');
  t.ok(m.isProjectUrl('https://abc.supabase.co') && m.isProjectUrl('https://abc.supabase.co/'), 'رابط المشروع (بشرطة بآخره وبلاها)');
  t.ok(!m.isProjectUrl('http://abc.supabase.co') && !m.isProjectUrl('https://u:p@abc.supabase.co') && !m.isProjectUrl('https://abc.supabase.co/rest/v1') && !m.isProjectUrl('abc'), 'http، اسم وكلمة سرّ، مسار، أو مو رابط: يرفض');
  t.ok(!m.isPublishableKey(`${fakeJwt({ role: 'anon' }).split('.').slice(0, 2).join('.')}.`), 'JWT anon توقيعه ضاع: يرفض (مثل env-guard)');
  console.error = quiet;
  globalThis.__TEST_ENV__ = { VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };

  // ── ما ينرسل طلب بمفتاح anon (S2، FOUNDATION ٢١٩) ──────────────────────────────────────────────────
  fake.plan.getSession = async () => ({ data: { session: session('u-1') }, error: null });
  fake.plan.rpc = async () => ({ data: { ok: true }, error: null, status: 200 });
  t.same(await m.call('my_workspace'), { ok: true }, 'بجلسة: النداء يطلع ويرجع جوابه');
  const client = fake.clients[0];
  t.ok(client.url === 'https://test.supabase.co' && client.key === 'sb_publishable_test', 'العميل بالرابط والمفتاح العامّ');
  fake.plan.getSession = async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });
  const before = client.calls.length;
  await t.rejects(m.call('my_workspace'), 'تجديد التوكن فشل عابراً: «ما وصل»، مو «انتهت الجلسة»', /^network$/);
  t.eq(client.calls.length, before, 'وما طلع طلب بمفتاح anon');
  fake.plan.getSession = async () => ({ data: { session: null }, error: null });
  let thrown = null;
  await m.call('my_workspace').catch((error) => (thrown = error));
  t.same([thrown instanceof m.IdentityError, thrown?.code, client.calls.length], [true, 'no_session', before], 'بلا جلسة أصلاً: هويّة، وبلا طلب');

  // ── سباق التجديد بين تبويبين (C5) ──────────────────────────────────────────────────────────────────
  {
    let reads = 0;
    fake.plan.getSession = async () => {
      reads += 1;
      return reads === 1 ? { data: { session: null }, error: { name: 'AuthRefreshDiscardedError', status: 409 } } : { data: { session: session('u-1') }, error: null };
    };
    fake.plan.rpc = async () => ({ data: 'ok', error: null, status: 200 });
    t.eq(await m.call('my_workspace'), 'ok', 'تبويب ثاني سبق بالتجديد: القراءة الثانية تلقى جلسته، مو «انتهت الجلسة»');
    fake.plan.getSession = async () => ({ data: { session: null }, error: { name: 'AuthRefreshDiscardedError', status: 409 } });
    await t.rejects(m.call('my_workspace'), 'تجديد انرمى بالمرّتين: «ما وصل»، مو هويّة', /^network$/);
  }

  // ── JWT مرفوض والجهاز يحسبه صالحاً (C7) ─────────────────────────────────────────────────────────────
  {
    fake.plan.getSession = async () => ({ data: { session: session('u-1') }, error: null });
    let sent = 0;
    fake.plan.rpc = async () => {
      sent += 1;
      return sent === 1 ? { data: null, error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 } : { data: 'ok', error: null, status: 200 };
    };
    fake.plan.refreshSession = async () => ({ data: { session: session('u-1') }, error: null });
    const live = fake.clients.at(-1);
    const before = live.refreshes ?? 0;
    t.eq(await m.call('my_workspace'), 'ok', 'ساعة الجهاز متأخّرة: تجديد واحد وإعادة، مو خروج');
    t.same([sent, (live.refreshes ?? 0) - before], [2, 1], 'طلبان وتجديد واحد');
    sent = 0;
    fake.plan.refreshSession = async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });
    await t.rejects(m.call('my_workspace'), 'التجديد ما وصل: «ما وصل»', /^network$/);
    sent = 0;
    fake.plan.refreshSession = async () => ({ data: { session: null }, error: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' } });
    let thrown = null;
    await m.call('my_workspace').catch((error) => (thrown = error));
    t.same([thrown instanceof m.IdentityError, thrown?.code], [true, 'refresh_rejected'], 'الخادم رفض التجديد نفسه: هويّة');
    fake.plan.refreshSession = undefined;
  }

  // ── مهلة قراءة الجلسة ولحظة الاتصال (C8، C9) ───────────────────────────────────────────────────────
  {
    net.onLine = false;
    fake.plan.getSession = never;
    const started = Date.now();
    await t.rejects(m.call('add_member'), 'بلا نت والتجديد يعيد: «ما وصل» بعد ثانية، مو «ما نعرف» بعد ١٥', /^session_timeout$/);
    t.ok(Date.now() - started < m.OFFLINE_SESSION_MS + 1000, 'وبمهلة قصيرة');
    fake.plan.getSession = async () => {
      net.onLine = true;
      return { data: { session: session('u-1') }, error: null };
    };
    fake.plan.rpc = async () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });
    let thrown = null;
    await m.call('add_member').catch((error) => (thrown = error));
    t.ok(thrown instanceof m.UnknownOutcomeError, 'الاتصال رجع قبل الإرسال والجواب ضاع: «ما نعرف»، مو «لم يُحفظ»');
    net.onLine = true;
    fake.plan.rpc = undefined;
  }

  // ── loadStaff ──────────────────────────────────────────────────────────────────────────────────────
  fake.plan.getSession = async () => ({ data: { session: session('u-1') }, error: null });
  const row = (id, extra) => ({ id, user_id: `u-${id}`, display_name: id, phone: null, role: 'viewer', accepted_at: null, archived_at: null, created_at: '2026-10-20T10:00:00Z', ...extra });
  fake.plan.tables = {
    members: { data: [row('a', { role: 'owner', accepted_at: '2026-10-20T10:00:00Z' }), row('b', { archived_at: '2026-10-21T10:00:00Z' }), row('c')], error: null, status: 200 },
    member_scopes: { data: [{ member_id: 'c', division_id: 'd-1' }, { member_id: 'c', division_id: null }], error: null, status: 200 },
    divisions: { data: [{ id: 'd-1', kind: 'broiler' }], error: null, status: 200 },
  };
  const staff = await m.loadStaff();
  t.same(staff.members.map((x) => x.id), ['a', 'c'], 'المؤرشف ما ينعرض بالموظفين');
  t.same([staff.members[0].accepted, staff.members[1].divisionIds], [true, ['d-1']], 'القبول والنطاق (والنطاق بلا وحدة ينترك)');
  fake.plan.tables.members = { data: [row('x', { role: 'boss' })], error: null, status: 200 };
  await t.rejects(m.loadStaff(), 'دور مو معروف من الخادم يرمي، مو يعرض شي غلط', /members\.role/);
  fake.plan.tables = undefined;

  // ── الإقلاع بلا نت ما ينتظر التجديد (S6) ────────────────────────────────────────────────────────────
  storeToken('u-1');
  fake.plan.getSession = never;
  net.onLine = false;
  let started = Date.now();
  t.same(await m.probeSession(true), { kind: 'offline', userId: 'u-1' }, 'بلا نت وتوكن محفوظ: offline فوراً بصاحب التوكن');
  t.ok(Date.now() - started < 500, 'بلا انتظار التجديد');
  net.onLine = true;
  started = Date.now();
  t.same(await m.probeSession(true), { kind: 'offline', userId: 'u-1' }, 'متّصل والتجديد معلّق: offline بعد المهلة القصيرة');
  const waited = Date.now() - started;
  t.ok(waited >= m.QUICK_PROBE_MS - 50 && waited < m.QUICK_PROBE_MS + 1000, `والمهلة القصيرة (${m.QUICK_PROBE_MS}) مو الكاملة`);
  fake.plan.getSession = async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });
  t.same(await m.probeSession(false), { kind: 'offline', userId: 'u-1' }, 'null ويّا خطأ شبكة وتوكن محفوظ = بلا نت (FOUNDATION ٢١٧)');
  fake.plan.getSession = async () => ({ data: { session: session('u-1') }, error: null });
  t.same(await m.probeSession(true), { kind: 'signed_in', userId: 'u-1' }, 'جلسة صالحة: داخل');
  fake.plan.getSession = async () => {
    localStorage.removeItem(TOKEN_KEY);
    return { data: { session: null }, error: null };
  };
  t.same(await m.probeSession(true), { kind: 'signed_out', previousUserId: 'u-1' }, 'توكن محفوظ والخادم رفض تجديده (auth-js مسحه): صاحبه ينذكر حتى تنمسح هويّته');
  fake.plan.getSession = async () => ({ data: { session: null }, error: null });
  t.same(await m.probeSession(true), { kind: 'signed_out', previousUserId: null }, 'بلا توكن وبلا خطأ: خرج فعلاً');
  storeToken('u-1');
  await m.dropClient();
  fake.plan.onCreate = () => localStorage.removeItem(TOKEN_KEY);
  t.same(await m.probeSession(true), { kind: 'signed_out', previousUserId: 'u-1' }, 'العميل الجديد مسح التوكن ببدايته: صاحبه انقرا قبلها');
  fake.plan.onCreate = undefined;

  // ── الخروج بجهاز مشترك (S4، FOUNDATION ٢٢٨) ───────────────────────────────────────────────────────
  const heard = [];
  const stop = m.onAuthChange((event, userId) => heard.push(`${event}:${userId}`));
  const first = fake.clients.at(-1);
  first.emit('SIGNED_IN', session('u-1'));
  t.eq(heard.length, 0, 'المستمع ما ينادى داخل onAuthStateChange (قفل auth-js، FOUNDATION ٢٠٣)');
  await tick();
  t.same(heard, ['SIGNED_IN:u-1'], 'وينادى بعده');
  storeToken('u-1');
  localStorage.setItem('sb-test-auth-token-code-verifier', 'v');
  fake.plan.signOut = never;
  const signingOut = m.signOutLocal();
  await new Promise((resolve) => setTimeout(resolve, 5_100));
  await signingOut;
  t.same([localStorage.getItem(TOKEN_KEY), localStorage.getItem('sb-test-auth-token-code-verifier')], [null, null], 'signOut معلّق بلا نت: مفاتيح sb-* تنمسح باليد');
  t.ok(first.disposed, 'والعميل القديم ينسقط (dispose)');
  fake.plan.signOut = undefined;
  await m.getClient();
  const second = fake.clients.at(-1);
  t.ok(second !== first, 'الدخول الجاي بعميل جديد');
  second.storage.setItem(TOKEN_KEY, JSON.stringify(session('u-2')));
  first.storage.removeItem(TOKEN_KEY);
  first.storage.setItem(TOKEN_KEY, JSON.stringify(session('u-1')));
  t.eq(JSON.parse(localStorage.getItem(TOKEN_KEY)).user.id, 'u-2', '/logout متأخّر من العميل القديم ما يمسح جلسة اللي دخل بعده ولا يرجّع جلسته');
  t.eq(first.storage.getItem(TOKEN_KEY), null, 'والقديم ما يقرا جلسة الجديد');
  heard.length = 0;
  first.emit('SIGNED_OUT', null);
  second.emit('TOKEN_REFRESHED', session('u-2'));
  await tick();
  t.same(heard, ['TOKEN_REFRESHED:u-2'], 'أحداث العميل القديم ساكتة، والجديد مسموع بلا اشتراك جديد');
  heard.length = 0;
  second.emit('SIGNED_IN', session('u-2'));
  await m.dropClient();
  await tick();
  t.same(heard, [], 'حدث انطلق والعميل انسقط قبل تسليمه: ما يوصل');
  const storageEvent = (key, newValue) => Object.assign(new Event('storage'), { key, newValue, storageArea: win.localStorage });
  win.dispatchEvent(storageEvent(TOKEN_KEY, null));
  await tick();
  t.same(heard, ['SIGNED_OUT:null'], 'تبويب ثاني مسح الجلسة بيده (بلا بثّ): هذا التبويب يسمع الخروج');
  heard.length = 0;
  win.dispatchEvent(storageEvent(TOKEN_KEY, '{"user":{"id":"u-3"}}'));
  win.dispatchEvent(storageEvent('sb-test-auth-token-code-verifier', null));
  await tick();
  t.same(heard, [], 'تجديد التوكن بتبويب ثاني أو مفتاح غيره: ماكو خروج');
  stop();

  // ── تخزين ممنوع (C12) وتفكيك العميل بعد initialize (C13) ────────────────────────────────────────────
  const blocked = {
    get length() {
      throw new Error('SecurityError');
    },
    key: () => {
      throw new Error('SecurityError');
    },
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
  const saved = globalThis.localStorage;
  globalThis.localStorage = blocked;
  const memory = m.revocableStorage();
  memory.setItem(TOKEN_KEY, 'x');
  t.eq(memory.getItem(TOKEN_KEY), 'x', 'بيانات الموقع ممنوعة: الجلسة بالذاكرة، مو «انتهت» بعد كل دخول');
  memory.revoked = true;
  t.eq(memory.getItem(TOKEN_KEY), null, 'وتنسحب مثل غيرها');
  globalThis.localStorage = saved;
  let finish;
  fake.plan.initialize = () => new Promise((resolve) => (finish = resolve));
  await m.getClient();
  const initializing = fake.clients.at(-1);
  await m.dropClient();
  const once = initializing.disposals;
  finish({ error: null });
  await tick();
  t.ok(once === 1 && initializing.disposals === 2, 'انسقط وinitialize بعده شغّال: التفكيك يتكرّر لمّا يكمل (ما يرجع مؤقّت التجديد)');
  fake.plan.initialize = undefined;
}
