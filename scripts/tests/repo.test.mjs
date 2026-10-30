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
  m.RetryableError && error instanceof m.RetryableError
    ? `retryable:${error.code}`
    : error instanceof m.IdentityError
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
      "export { classifyPostgrest, call, explained, violatedConstraint, unknownConstraint } from './src/lib/repo/core.ts';",
      "export { constraintHint, CONSTRAINT_HINTS } from './src/lib/repo/constraints.ts';",
      "export { mapAuthError, signIn } from './src/lib/repo/signin.ts';",
      "export { loadHomeSummary, parseHomeSummary, HomeShapeError } from './src/lib/repo/home.ts';",
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
  // المرحلة 1 (WP0): التزاحم على قفل «لم يُرحَّل، أعد المحاولة» (مو رفض)، وقيد check باسمه وجملته الفصيحة.
  t.eq(pg({ code: '40P01', message: 'deadlock detected' }, 500), 'retryable:40P01', 'قفل متبادل (40P01): أعد المحاولة، مو رفض');
  t.eq(pg({ code: '55P03', message: 'canceling statement due to lock timeout' }, 500), 'retryable:55P03', 'مهلة القفل (55P03): أعد المحاولة');
  t.eq(pg({ code: '55P03', message: 'lock timeout' }, 500, 'table'), 'retryable:55P03', 'مهلة القفل على جدول هم إعادة');
  const retry = m.describeError(new m.RetryableError('40P01'));
  t.same([retry.kind, retry.title], ['retryable', 'لم يُحفظ، أعد المحاولة'], 'التزاحم يوصف «لم يُحفظ، أعد المحاولة»');
  t.ok(m.describeError(new m.RetryableError('55P03')).detail.includes('لم يُحفظ شيء'), 'ويكول إن شيئاً لم يُحفظ');
  // المرحلة 1 WP3: التصنيف متزامن باسم القيد بلا جملته (القاموس كسول برّا مسار الجلسة)، وexplained يجيب الجملة.
  const phoneCheck = m.classifyPostgrest({ code: '23514', message: 'new row for relation "members" violates check constraint "members_phone_check"' }, 400, 'rpc', true);
  t.same([kindOf(m, phoneCheck), phoneCheck.constraint], ['rejected:check_violation:', 'members_phone_check'], '23514 متزامناً: رفض باسم القيد، والجملة بعدها (القاموس ما تحمّل)');
  const explain = async (error, status, kind = 'rpc') => kindOf(m, await m.explained(m.classifyPostgrest(error, status, kind, true)));
  t.eq(
    await explain({ code: '23514', message: 'new row for relation "members" violates check constraint "members_phone_check"' }, 400),
    'rejected:check_violation:رقم الهاتف يجب أن يكون رقم موبايل عراقياً صحيحاً.',
    '23514 بعد explained يسمّي القيد بجملته من constraint.<اسم القيد>',
  );
  t.eq(
    await explain({ code: '23514', message: 'new row for relation "orgs" violates check constraint "orgs_name_check"' }, 400, 'table'),
    'rejected:check_violation:اسم المنشأة مطلوب، ولا يزيد على 120 حرفاً.',
    '23514 على كتابة مباشرة بجدول: نفس الجملة',
  );
  const unknownCheck = await explain({ code: '23514', message: 'new row for relation "x" violates check constraint "x_qty_check"' }, 400);
  t.ok(unknownCheck.startsWith('rejected:check_violation:') && unknownCheck.includes('«x_qty_check»'), 'قيد مو بالقائمة: جملة عامة تسمّيه، مو «بعض القيم غير صحيحة»');
  const other = new m.RejectedError('forbidden', 'لا تملك صلاحية.');
  t.eq(await m.explained(other), other, 'explained يرجّع غير رفض القيد كما هو (نفس الكائن)');
  // القاموس ما انحمّل (حزمته ما وصلت بلا نت): جملة عامة باسم القيد، مو خطأ تحميل خام.
  const broken = await build({
    stdin: { contents: "export { classifyPostgrest, explained } from './src/lib/repo/core.ts'; export { RejectedError } from './src/lib/errors.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins: [{ name: 'hints-offline', setup(b) { b.onResolve({ filter: /^\.\/constraints$/ }, () => ({ path: 'hints', namespace: 'offline' })); b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: "throw new Error('chunk_load_failed');", loader: 'js' })); } }],
  });
  const offline = await import(`data:text/javascript;base64,${Buffer.from(broken.outputFiles[0].text).toString('base64')}`);
  const offlineHint = (await offline.explained(offline.classifyPostgrest({ code: '23514', message: 'violates check constraint "members_phone_check"' }, 400, 'rpc', true))).hint;
  t.ok(offlineHint.includes('«members_phone_check»'), `القاموس ما انحمّل: جملة عامة تسمّي القيد (${offlineHint})`);
  t.eq(m.violatedConstraint('value for domain d violates check constraint "d_check"'), 'd_check', 'اسم القيد من رسالة النطاق هم');
  t.eq(m.violatedConstraint(undefined), null, 'بلا رسالة: ماكو اسم');

  // ── GoTrue ────────────────────────────────────────────────────────────────────────────────────────
  const auth = (error, online = true) => kindOf(m, m.mapAuthError(error, online));
  t.ok(auth({ code: 'invalid_credentials', status: 400 }).startsWith('rejected:invalid_credentials:البريد أو كلمة السرّ غير صحيحة'), 'الدخول الغلط بالفصحى');
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

  // ── محلّل الرئيسية (home_summary صار نداءً حيّاً لكل مستخدم): الشكل الصحيح، والمختلّ يرمي باسم حقله، والفارغ فارغ ───────────
  const accounts = { receivable: '4000.00', payable: '0', negative_boxes: 1, books: { visible: 1, total: 7 } };
  const parsed = m.parseHomeSummary({ accounts });
  t.same(
    [parsed.accounts?.receivable, parsed.accounts?.payable, parsed.accounts?.negativeBoxes, parsed.accounts?.visibleBooks, parsed.accounts?.totalBooks],
    [400_000n, 0n, 1, 1, 7],
    'الرئيسية: «لنا» و«علينا» بالفلس، والصناديق بالسالب، والدفاتر الظاهرة من المجموع',
  );
  t.same(m.parseHomeSummary({}), {}, 'بلا بطاقة حسابات (دور بلا حسابات): ملخّص فارغ');
  // 0007: تنبيهات المخزون بوحداتها: تحت الحدّ الأدنى لكل وحدة بمخازن تستلم من المورّد (E22: المعمل والأدوية والعامّة والمفقس)،
  // وقريب الانتهاء للأدوية، وأفراخ المفقس فاتها 48 ساعة؛ والوحدة بلا بطاقة تنبيه تنترك، والشكل الغلط يرمي باسمه.
  const stock = [
    { division_id: 'd-0', kind: 'feed_mill', below_min: 4, near_expiry: 0, old_chicks: 0 },
    { division_id: 'd-1', kind: 'medicine', below_min: 1, near_expiry: 2, old_chicks: 0 },
    { division_id: 'd-2', kind: 'general', below_min: 3, near_expiry: 0, old_chicks: 0 },
    { division_id: 'd-3', kind: 'hatchery', below_min: 2, near_expiry: 0, old_chicks: 120 },
    { division_id: 'd-4', kind: 'broiler', below_min: 0, near_expiry: 0, old_chicks: 0 },
  ];
  t.same(
    m.parseHomeSummary({ stock }),
    { millBelowMinimum: 4, medicine: { nearExpiry: 2, belowMinimum: 1 }, general: { belowMinimum: 3 }, oldChicks: 120, hatcheryBelowMinimum: 2 },
    'الرئيسية: تحت الحدّ الأدنى للمعمل والأدوية والعامّة والمفقس، وقريب الانتهاء للأدوية، وأفراخ المفقس فاتها 48 ساعة',
  );
  t.same(m.parseHomeSummary({ stock: [] }), {}, 'بلا مخازن بالنطاق: ملخّص فارغ');
  const stockShape = (value) => {
    try {
      m.parseHomeSummary(value);
      return 'ما رمى';
    } catch (error) {
      return error instanceof m.HomeShapeError ? error.message : `رمى غيره: ${error.message}`;
    }
  };
  t.same([stockShape({ stock: {} }), stockShape({ stock: [{ kind: 'general', below_min: '3' }] })], ['home_shape:stock', 'home_shape:below_min'], 'تنبيهات بشكل غلط ترمي باسمها');
  const shape = (value) => {
    try {
      m.parseHomeSummary(value);
      return 'ما رمى';
    } catch (error) {
      return error instanceof m.HomeShapeError ? error.message : `رمى غيره: ${error.message}`;
    }
  };
  t.same(
    {
      missingBoxes: shape({ accounts: { ...accounts, negative_boxes: undefined } }),
      textBoxes: shape({ accounts: { ...accounts, negative_boxes: '1' } }),
      fractionBoxes: shape({ accounts: { ...accounts, negative_boxes: 1.5 } }),
      negativeBoxes: shape({ accounts: { ...accounts, negative_boxes: -1 } }),
      numberMoney: shape({ accounts: { ...accounts, receivable: 4000 } }),
      missingBooks: shape({ accounts: { ...accounts, books: undefined } }),
      textBooks: shape({ accounts: { ...accounts, books: { visible: '1', total: 7 } } }),
      notObject: shape([]),
      accountsNull: shape({ accounts: null }),
    },
    {
      missingBoxes: 'home_shape:negative_boxes',
      textBoxes: 'home_shape:negative_boxes',
      fractionBoxes: 'home_shape:negative_boxes',
      negativeBoxes: 'home_shape:negative_boxes',
      numberMoney: 'home_shape:receivable',
      missingBooks: 'home_shape:books',
      textBooks: 'home_shape:visible',
      notObject: 'home_shape:summary',
      accountsNull: 'home_shape:accounts',
    },
    'الشكل المختلّ يرمي HomeShapeError باسم حقله (مو بطاقة بأرقام غلط)',
  );
  await t.rejects(m.call('my_workspace'), 'بلا مفاتيح: النداء «غير مربوط»', /not_connected/);
  await t.rejects(m.signIn('12345', 'password1'), 'رقم غلط يرفض قبل أي طلب', /invalid_login/);
  await t.rejects(m.signIn('name@', 'password1'), 'بريد ناقص يرفض قبل أي طلب', /invalid_login/);

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
  const fake = { clients: [], plan: {}, queries: [] };
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
        // كل استعلام يتسجّل بخطواته (fake.queries)، والعدّ (select بـhead) يرجّع count مو صفوف (listItems، WP2).
        const query = { table, ops: [] };
        fake.queries.push(query);
        const head = () => query.ops.some(([op, , options]) => op === 'select' && options?.head);
        const chain = {
          then: (ok, bad) => Promise.resolve(head() ? { data: null, count: fake.plan.counts?.[table] ?? 0, error: null, status: 200 } : result).then(ok, bad),
        };
        for (const op of ['select', 'order', 'is', 'or', 'limit', 'eq', 'insert', 'update', 'like']) {
          chain[op] = (...args) => {
            query.ops.push([op, ...args]);
            return chain;
          };
        }
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
        "export { listItems, ITEMS_PAGE, loadOrgSetup, parseStockBoard, parseItemLots, parseItemMoves, parseTransferPreview, parseOpeningPreview, loadStockValues, loadStockValueTotals, loadItemLotValues, loadItemLots, loadItemMoves, deleteDraftLine, createTransferDraft, updateStockDraft, listStockDocs, RowShapeError } from './src/lib/repo/inventory.ts';",
        "export { unitCost4 } from './src/domain/money.ts';",
        "export { fmtUnitCost } from './src/lib/format.ts';",
        "export { loadPartyBalances, createParty, recordPayment } from './src/lib/repo/parties.ts';",
        "export { searchable } from './src/domain/normalize.ts';",
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
    member_scopes: {
      data: [
        { member_id: 'c', division_id: 'd-1', site_id: null, warehouse_id: null },
        { member_id: 'c', division_id: null, site_id: 's-1', warehouse_id: null },
        { member_id: 'c', division_id: null, site_id: null, warehouse_id: 'w-1' },
        { member_id: 'c', division_id: null },
      ],
      error: null,
      status: 200,
    },
    divisions: { data: [{ id: 'd-1', kind: 'broiler' }], error: null, status: 200 },
  };
  const staff = await m.loadStaff();
  t.same(staff.members.map((x) => x.id), ['a', 'c'], 'المؤرشف ما ينعرض بالموظفين');
  t.same([staff.members[0].accepted, staff.members[1].divisionIds], [true, ['d-1']], 'القبول والنطاق (والنطاق بلا وحدة ينترك)');
  t.same([staff.members[1].siteIds, staff.members[1].warehouseIds, staff.members[0].siteIds], [['s-1'], ['w-1'], []], 'النطاق بالموقع والمخزن (0005): كل صفّ بقائمة هدفه');
  fake.plan.tables.members = { data: [row('x', { role: 'boss' })], error: null, status: 200 };
  await t.rejects(m.loadStaff(), 'دور مو معروف من الخادم يرمي، مو يعرض شي غلط', /members\.role/);
  fake.plan.tables = undefined;

  // ── listItems (WP2): الصفحة الجاية بعد آخر صفّ بالضبط (gt، مو gte: الصفّ الأخير ما يتكرّر)، وبس لمّا الصفحة كاملة، والعدد
  // الكلّي من القاعدة بأوّل صفحة بس ─────────────────────────────────────────────────────────────────────────────
  const itemRow = (n) => ({ id: `i-${n}`, version: 1, archived_at: null, name: `مادّة ${n}`, name_norm: `ماده ${n}`, category_id: null, kind: 'raw', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null, tracks_expiry: false, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [] });
  const rowsQuery = () => fake.queries.filter((q) => q.table === 'items' && !q.ops.some(([op, , options]) => op === 'select' && options?.head)).at(-1);
  fake.plan.tables = { items: { data: [1, 2, 3].map(itemRow), error: null, status: 200 } };
  fake.plan.counts = { items: 3 };
  const short = await m.listItems({ search: 'ذرة' });
  t.same([short.rows.length, short.total, short.next], [3, 3, null], 'صفحة ناقصة: بلا صفحة جاية، والعدد الكلّي من القاعدة');
  fake.plan.tables.items.data = Array.from({ length: m.ITEMS_PAGE }, (_, i) => itemRow(i));
  const fullPage = await m.listItems({ after: { nameNorm: 'ماده 9', id: 'i-9' } });
  const cursor = rowsQuery().ops.find(([op]) => op === 'or')?.[1];
  t.same(
    [fullPage.next, fullPage.total, cursor],
    [{ nameNorm: `ماده ${m.ITEMS_PAGE - 1}`, id: `i-${m.ITEMS_PAGE - 1}` }, null, 'name_norm.gt."ماده 9",and(name_norm.eq."ماده 9",id.gt.i-9)'],
    'صفحة كاملة: المؤشّر آخر صفّ، والصفحة بعده بالضبط (الاسم المطبَّع ثم المعرّف، أكبر بس)، وبلا عدّ بعد أوّل صفحة',
  );
  fake.plan.tables = undefined;
  fake.plan.counts = undefined;

  // ── قراءات المخزون (0007، WP4): أشكال الخادم نفسها (كما يرجّعها SQL ويفحصها stock.test) ← فلس وآلاف بمحلّلات repo، والقيمة
  // المخفية لدور بلا كلفة null، والشكل الغلط يرمي باسم خانته (مو صفر بصمت) ────────────────────────────────────────────────
  {
    fake.plan.getSession = async () => ({ data: { session: session('u-1') }, error: null });
    const shapeOf = (fn) => {
      try {
        fn();
        return 'ما رمى';
      } catch (error) {
        return error instanceof m.RowShapeError ? error.message : `رمى غيره: ${error.message}`;
      }
    };
    const chickBoard = {
      warehouse: { id: 'w-1', name: 'مخزن الأفراخ', kind: 'chick', division_id: 'd-1', division_kind: 'hatchery', archived: false, has_balance: true },
      as_of: '2026-10-30T11:05:00.123+00:00',
      today: '2026-10-30',
      rows: [{ item_id: 'i-1', name: 'أفراخ لحم', kind: 'chick', base_unit: 'pc', tracks_expiry: false, min_qty: null, archived: false, available: '150.000', expired: '0', near_expiry: '0', below_min: false, oldest_born_at: '2026-10-28T09:00:00+00:00', chick_age_hours: '50', old_chicks: '100.000' }],
      next: { name: 'افراخ لحم', id: 'i-1' },
      total: 101,
    };
    const parsedBoard = m.parseStockBoard(chickBoard);
    t.same(
      [parsedBoard.rows[0].available, parsedBoard.rows[0].expired, parsedBoard.rows[0].chickAgeHours, parsedBoard.rows[0].oldChicks, parsedBoard.warehouse.hasBalance, parsedBoard.next, parsedBoard.total],
      [150_000n, 0n, 50n, 100_000n, true, { name: 'افراخ لحم', id: 'i-1' }, 101],
      'stock_on_hand: «150.000» و«0» بالآلاف، وعمر الفرخ 50 ساعة، و100 فرخ فاتها 48 ساعة، والمؤشّر والعدد',
    );
    t.eq(shapeOf(() => m.parseStockBoard({ ...chickBoard, rows: [{ ...chickBoard.rows[0], available: 150 }] })), 'row_shape:available', 'كمية رقم JSON (مو نصّ عشري) ترمي باسمها');
    t.eq(shapeOf(() => m.parseStockBoard({ ...chickBoard, rows: [{ ...chickBoard.rows[0], old_chicks: null }] })), 'row_shape:old_chicks', 'old_chicks فارغة ترمي، مو صفر');
    const lots = m.parseItemLots({
      item: { id: 'i-1', name: 'علف', kind: 'feed', base_unit: 'kg', tracks_expiry: false, min_qty: '1500.000', density: null, piece_mass_kg: null, archived: false },
      rows: [{ lot_id: 'l-1', qty_left: '5000.000', received_on: '2026-10-15', root_received_on: '2026-10-01', age_days: 29, born_at: null, age_hours: null, expiry_on: null, expired: false, near_expiry: false, source_kind: 'transfer', source_id: 't-1', source: 'TR-2026-0001', supplier_lot_no: null }],
      next: { id: 'l-1' },
      total: 3,
    });
    t.same([lots.rows[0].qtyLeft, lots.rows[0].ageDays, lots.item.minQty, lots.next, lots.total], [5_000_000n, 29, 1_500_000n, 'l-1', 3], 'item_lots_qty: المتبقّي بالآلاف وعمر الجذر بالأيام والمؤشّر معرّف الدفعة');
    t.eq(shapeOf(() => m.parseItemLots({ item: { id: 'i', name: 'x', kind: 'feed', base_unit: 'kg', tracks_expiry: false, min_qty: null, density: null, piece_mass_kg: null, archived: false }, rows: [{ lot_id: 'l', qty_left: '1.000', received_on: 'x', root_received_on: 'x', age_days: '29', source_kind: 'opening', source_id: 's', source: 'x' }], next: null, total: 1 })), 'row_shape:age_days', 'age_days نصّ (مو عدد) يرمي');
    const moves = m.parseItemMoves({
      rows: [{ move_id: 'mv-2', seq: '8', moved_on: '2026-10-30', doc_kind: 'transfer', doc_id: 't-1', doc: 'TR-2026-0001', qty: '-5000.000', running: '0.000', lot_id: 'l-1', reverses_move_id: 'mv-1', reversed: false }],
      next: '8',
      total: 250,
    });
    t.same([moves.rows[0].seq, moves.rows[0].qty, moves.rows[0].running, moves.rows[0].reversesMoveId, moves.next, moves.total], [8n, -5_000_000n, 0n, 'mv-1', 8n, 250], 'item_moves_qty: الكمية السالبة بالآلاف، والرقم والمؤشّر bigint');
    const sent = [];
    fake.plan.rpc = async (fn, args) => {
      sent.push([fn, args]);
      if (fn === 'item_lots_value') return { data: { item_id: 'i-1', warehouse_id: 'w-1', rows: [{ lot_id: 'l-1', qty_left: '5000.000', value_left: '2404166.67' }] }, error: null, status: 200 };
      if (fn === 'stock_values') return { data: { warehouse_id: 'w-1', rows: [{ item_id: 'i-1', available: '36000.00', expired: '0' }] }, error: null, status: 200 };
      if (fn === 'stock_value_totals') return { data: { warehouse_id: 'w-1', units: [{ base_unit: 'kg', available: '9950.000', expired: '0' }], money: { available: '6911066.67', expired: '0', total: '6911066.67' } }, error: null, status: 200 };
      if (fn === 'archived_stores_with_stock') return { data: ['w-2'], error: null, status: 200 };
      return { data: null, error: null, status: 200 };
    };
    const lotValue = (await m.loadItemLotValues('i-1', 'w-1', 'l-0')).get('l-1');
    t.same([lotValue.valueLeft, lotValue.qtyLeft, m.fmtUnitCost(m.unitCost4(lotValue.valueLeft, lotValue.qtyLeft))], [240_416_667n, 5_000_000n, '480.8333'], 'item_lots_value: 2,404,166.67 لـ5,000 كغم ← كلفة الوحدة 480.8333 (C2)');
    t.same(sent.at(-1), ['item_lots_value', { p_item: 'i-1', p_warehouse: 'w-1', p_after: { id: 'l-0' }, p_limit: 100 }], 'قيم الدفعات بنفس مؤشّر صفحة الدفعات');
    t.same((await m.loadStockValues('w-1', { name: 'x', id: 'i-0' })).get('i-1'), { available: 3_600_000n, expired: 0n }, 'stock_values: القيمة بالفلس و«0» صفر');
    t.same(sent.at(-1), ['stock_values', { p_warehouse: 'w-1', p_after: { name: 'x', id: 'i-0' }, p_limit: 100 }], 'قيم اللوحة بمؤشّر صفحتها (الاسم والمعرّف كما وصلا)');
    const totals = await m.loadStockValueTotals('w-1');
    t.same([totals.total, totals.available, totals.expired, totals.units[0].available], [691_106_667n, 691_106_667n, 0n, 9_950_000n], 'stock_value_totals: المجموع من الخادم بالفلس والكمية بالآلاف');
    const masked = m.parseTransferPreview({
      id: 't-1', kind: 'transfer', status: 'draft', version: 3, plan: '0123456789abcdef0123456789abcdef', doc_no: null, internal_export: true, to_division_kind: 'feed_mill', problems: [], ready: true,
      lines: [{ line_id: 'x', line_no: 1, item_id: 'i-1', item_name: 'كاز أويل', base_unit: 'L', tracks_expiry: false, qty: '1000.000', qty_in_unit: '1000.000', unit_label: 'L', item_unit_id: null, unit_code: null, available: '1000.000', expired: '0', later: '0', shortage: '0.000', whole_balance: true, problem: null, draws: [{ lot_id: 'l-1', qty: '1000.000', received_on: '2026-10-20', expiry_on: null, source_kind: 'opening', source: 'رصيد افتتاح بتاريخ 20/10/2026', supplier_lot_no: null }] }],
    });
    t.same([masked.lines[0].value, masked.lines[0].draws[0].value, masked.lines[0].qty, masked.lines[0].wholeBalance], [null, null, 1_000_000n, true], 'معاينة الأمين (بلا money): القيمة null مو صفر، والكمية بالآلاف');
    const opening = m.parseOpeningPreview({
      id: 'o-1', kind: 'opening', status: 'draft', version: 2, problems: [], ready: false, money: { total: '65000.00' },
      lines: [{ line_id: 'a', line_no: 1, item_id: 'i', item_name: 'أفراخ', base_unit: 'pc', qty: '100.000', expiry_on: null, born_at: null, zero_reason: null, problem: { code: 'born_at_required', hint: 'اكتب وقت فقس «أفراخ».' }, money: { value: '65000.00' } }],
    });
    t.same([opening.total, opening.lines[0].value, opening.lines[0].problem?.code], [6_500_000n, 6_500_000n, 'born_at_required'], 'معاينة الافتتاح للمدير: القيمة والمجموع بالفلس ومشكلة السطر');
    // «مؤرشف وعليه رصيد» (§2.6): قائمة المخازن تاخذ العلامة من الخادم.
    fake.plan.tables = {
      warehouses: { data: [{ id: 'w-1', division_id: 'd-1', site_id: 's-1', name: 'العامّ', kind: 'general', archived_at: null, version: 1 }, { id: 'w-2', division_id: 'd-1', site_id: 's-1', name: 'القديم', kind: 'general', archived_at: '2026-10-29T00:00:00Z', version: 2 }], error: null, status: 200 },
    };
    const orgSetup = await m.loadOrgSetup();
    t.same(orgSetup.warehouses.map((w) => [w.id, w.archived, w.hasBalance]), [['w-1', false, false], ['w-2', true, true]], 'إعداد المنشأة: المخزن المؤرشف وعليه رصيد بعلامته من archived_stores_with_stock');

    // ── اختبار الطفرات (WP4): العدد السالب أو الكسري والقيمة الفارغة ترمي باسم خانتها، والمؤشّرات بشكل الخادم (نصّ لرقم الحركة
    // و{ id } للدفعة)، والمسوّدة بشرط نسختها وملاحظتها مقصوصة، والمرحَّل ثم الملغى «مرحَّل» من ختمه ─────────────────────────
    t.same(
      [shapeOf(() => m.parseStockBoard({ ...chickBoard, total: -1 })), shapeOf(() => m.parseStockBoard({ ...chickBoard, total: 1.5 }))],
      ['row_shape:total', 'row_shape:total'],
      'العدد الكلّي سالباً أو بكسر يرمي باسمه (مو «N من المجموع» غلط)',
    );
    const lotItem = { id: 'i', name: 'x', kind: 'feed', base_unit: 'kg', tracks_expiry: false, min_qty: null, density: null, piece_mass_kg: null, archived: false };
    const lotOf = (over) => ({ lot_id: 'l', qty_left: '1.000', received_on: '2026-10-01', root_received_on: '2026-10-01', age_days: 29, born_at: null, age_hours: null, expiry_on: null, expired: false, near_expiry: false, source_kind: 'opening', source_id: 's', source: 'x', supplier_lot_no: null, ...over });
    t.eq(shapeOf(() => m.parseItemLots({ item: lotItem, rows: [lotOf({ age_days: null })], next: null, total: 1 })), 'row_shape:age_days', 'age_days فارغ يرمي (مو عمر فارغ)');
    const moveOf = (over) => ({ move_id: 'mv', seq: '1', moved_on: '2026-10-30', doc_kind: 'transfer', doc_id: 't', doc: 'TR-2026-0001', qty: '1.000', running: '1.000', lot_id: 'l', reverses_move_id: null, reversed: false, ...over });
    t.eq(shapeOf(() => m.parseItemMoves({ rows: [moveOf({ seq: null })], next: null, total: 1 })), 'row_shape:seq', 'رقم الحركة الفارغ يرمي');
    const maskedOpening = m.parseOpeningPreview({
      id: 'o-1', kind: 'opening', status: 'draft', version: 2, problems: [], ready: true,
      lines: [{ line_id: 'a', line_no: 1, item_id: 'i', item_name: 'كاز', base_unit: 'L', qty: '1.000', expiry_on: null, born_at: null, zero_reason: null, problem: null }],
    });
    t.same([maskedOpening.total, maskedOpening.lines[0].value], [null, null], 'معاينة افتتاح بلا money: المجموع والقيمة null مو صفر');
    fake.plan.rpc = async (fn, args) => {
      sent.push([fn, args]);
      if (fn === 'stock_values') return { data: { warehouse_id: 'w-1', rows: [{ item_id: 'i-1', available: args.p_after?.id === 'bad' ? null : '36000.00', expired: '1250.50' }] }, error: null, status: 200 };
      if (fn === 'item_lots_qty') return { data: { item: lotItem, rows: [lotOf({})], next: null, total: 1 }, error: null, status: 200 };
      if (fn === 'item_moves_qty') return { data: { rows: [moveOf({ seq: '9' })], next: null, total: null }, error: null, status: 200 };
      if (fn === 'delete_draft_line') return { data: { line_id: 'x', deleted: true, doc_id: 't-1', version: 5 }, error: null, status: 200 };
      return { data: null, error: null, status: 200 };
    };
    t.same((await m.loadStockValues('w-1', { name: 'x', id: 'i-0' })).get('i-1'), { available: 3_600_000n, expired: 125_050n }, 'stock_values: قيمة المنتهي بالفلس (1,250.50)');
    t.eq(await m.loadStockValues('w-1', { name: 'x', id: 'bad' }).then(() => 'ما رمى', (error) => (error instanceof m.RowShapeError ? error.message : `رمى غيره: ${error.message}`)), 'row_shape:available', 'قيمة فارغة من الخادم ترمي باسمها، مو صفر');
    await m.loadItemLots('i-1', 'w-1', 'l-0');
    t.same(sent.at(-1), ['item_lots_qty', { p_item: 'i-1', p_warehouse: 'w-1', p_after: { id: 'l-0' }, p_limit: 100 }], 'صفحة الدفعات الجاية بمؤشّر { id } (شكل item_lots_qty)');
    await m.loadItemMoves('i-1', 'w-1', 8n);
    t.same(sent.at(-1), ['item_moves_qty', { p_item: 'i-1', p_warehouse: 'w-1', p_after_seq: '8', p_limit: 100 }], 'صفحة الحركات الجاية برقم آخر حركة نصّاً عشرياً (bigint، E3)');
    t.same(await m.deleteDraftLine('transfer', 'x', 4), { deleted: true, version: 5 }, 'حذف السطر يرجّع نسخة المسوّدة الجديدة');
    const tr = (over) => ({ id: 't-1', created_at: '2026-10-30T10:00:00.000001+00:00', doc_no: null, from_warehouse_id: 'w-1', to_warehouse_id: 'w-2', moved_on: '2026-10-30', status: 'draft', version: 1, note: null, posted_at: null, void_reason: null, ...over });
    const op = (over) => ({ id: 'o-1', created_at: '2026-10-20T10:00:00.000001+00:00', warehouse_id: 'w-1', on_date: '2026-10-20', status: 'draft', version: 3, note: null, posted_at: null, void_reason: null, ...over });
    fake.plan.tables = { transfers: { data: [tr({})], error: null, status: 201 }, opening_docs: { data: [op({})], error: null, status: 200 } };
    const lastQuery = (table) => fake.queries.filter((q) => q.table === table).at(-1);
    await m.createTransferDraft('w-1', 'w-2', '2026-10-30', '   ');
    await m.createTransferDraft('w-1', 'w-2', '2026-10-30', '  كاز  ');
    t.same(fake.queries.filter((q) => q.table === 'transfers').slice(-2).map((q) => q.ops.find(([name]) => name === 'insert')[1].note), [null, 'كاز'], 'ملاحظة المسوّدة مقصوصة، والفارغة null (مو قيد ملاحظة فارغة)');
    await m.updateStockDraft({ id: 't-1', kind: 'transfer', version: 4 }, { note: 'x' });
    const trUpdate = lastQuery('transfers').ops;
    await m.updateStockDraft({ id: 'o-1', kind: 'opening', version: 3 }, { day: '2026-10-21' });
    const opUpdate = lastQuery('opening_docs').ops;
    t.same(
      [trUpdate.filter(([name]) => name === 'eq').map(([, column, value]) => [column, value]), opUpdate.filter(([name]) => name === 'eq').map(([, column, value]) => [column, value])],
      [[['id', 't-1'], ['version', 4]], [['id', 'o-1'], ['version', 3]]],
      'تعديل رأس المسوّدة بشرط نسختها (FOUNDATION ٨١٧) للنوعين',
    );
    fake.plan.tables = { transfers: { data: [tr({ status: 'void', doc_no: 'TR-2026-0001', posted_at: '2026-10-30T10:00:00Z', void_reason: 'خطأ', version: 3 }), tr({ id: 't-2', status: 'void', version: 2 })], error: null, status: 200 } };
    t.same((await m.listStockDocs('transfer')).rows.map((d) => [d.id, d.status, d.posted]), [['t-1', 'void', true], ['t-2', 'void', false]], 'الملغى بعد ترحيله مرحَّل بختمه، والمطويّة بلا ترحيل');
    fake.plan.tables = undefined;
    fake.plan.rpc = undefined;
  }

  // ── ملفّا الحسابات (WP3، اختبار الطفرات): البحث مطبَّع بمرآة الخادم قبل ما يطلع، والمبلغ دينار صحيح نصّاً بنفس المعرّف والمرجع،
  // ورفض قيد check من الدوالّ أو من كتابة مباشرة يوصل الشاشة بجملة قيده (explained)، مو «check_violation» بلا جملة ─────────
  {
    fake.plan.getSession = async () => ({ data: { session: session('u-1') }, error: null });
    const sent = [];
    fake.plan.rpc = async (fn, args) => {
      sent.push([fn, args]);
      if (fn === 'report_party_balances') return { data: { books: [], rows: [], next: null, total: 0 }, error: null, status: 200 };
      return { data: { id: 'e-1', kind: 'payment', doc_no: 'RC-2026-0001', on_date: '2026-10-30', money: { amount: '-1500000', remaining: '0' } }, error: null, status: 200 };
    };
    await m.loadPartyBalances({ from: '2026-01-01', to: null, search: '  مزرعةُ  الأمل ' });
    await m.loadPartyBalances({ from: '2026-01-01', to: null, search: 'ـــ' });
    t.same(sent.map(([, args]) => args.p_search), [m.searchable('  مزرعةُ  الأمل '), null], 'بحث الجهات مطبَّع (searchable) قبل الإرسال، والتطويل وحده = بلا بحث');
    const ref = { id: 'id-1', clientRef: 'ref-1' };
    await m.recordPayment(ref, { partyId: 'p-1', bookId: 'b-1', amount: 1_500_000n * 100n, accountId: 'c-1', onDate: '2026-10-30' });
    t.same(sent.at(-1), ['record_party_payment', { p_id: 'id-1', p_party: 'p-1', p_book: 'b-1', p_amount: '1500000', p_account: 'c-1', p_on_date: '2026-10-30', p_client_ref: 'ref-1' }], '«قبضنا» على السلك: المعرّف والمرجع من الجهاز والمبلغ دينار صحيح نصّاً');
    fake.plan.rpc = async () => ({ data: null, error: { code: '23514', message: 'new row for relation "orgs" violates check constraint "orgs_name_check"' }, status: 400 });
    let rpcRefused = null;
    await m.call('create_my_org').catch((error) => (rpcRefused = error));
    t.same([rpcRefused instanceof m.RejectedError, rpcRefused?.code, rpcRefused?.hint], [true, 'check_violation', 'اسم المنشأة مطلوب، ولا يزيد على 120 حرفاً.'], 'رفض قيد من دالّة (call): الشاشة تاخذ جملة القيد');
    fake.plan.tables = { parties: { data: null, error: { code: '23514', message: 'new row for relation "parties" violates check constraint "parties_name_check"' }, status: 400 } };
    let writeRefused = null;
    await m.createParty({ name: 'x', phone: null, is_customer: true, is_supplier: false }).catch((error) => (writeRefused = error));
    t.same([writeRefused instanceof m.RejectedError, writeRefused?.code, writeRefused?.hint], [true, 'check_violation', 'اسم الجهة مطلوب، ولا يزيد على 120 حرفاً.'], 'رفض قيد من كتابة مباشرة (جهة): جملة قيدها من قاموس الحسابات');
    fake.plan.tables = undefined;
    fake.plan.rpc = undefined;
  }

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
