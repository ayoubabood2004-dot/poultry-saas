// شاشات الدخول وأوّل دخول والموظفين مرسومة نصّاً من المصدر الحقيقي: الرقم والرمز LTR بلا فواصل آلاف، الأدوار
// والوحدات بأسمائها، «كل الوحدات» و«لا وحدة» مثل inScope، والتحقّق قبل الإرسال. البوّابة (createPortal) بمكانها.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REACT = "export { renderToStaticMarkup } from 'react-dom/server.browser'; export { createElement as h } from 'react';";

const inlinePortal = {
  name: 'inline-portal',
  setup(b) {
    b.onResolve({ filter: /^react-dom$/ }, (args) => (args.namespace === 'portal' ? undefined : { path: 'react-dom', namespace: 'portal' }));
    b.onLoad({ filter: /.*/, namespace: 'portal' }, () => ({
      contents: "export * from 'react-dom'; export const createPortal = (node) => node;",
      resolveDir: ROOT,
    }));
  },
};

async function bundle(contents) {
  const result = await build({
    stdin: { contents: `${contents} ${REACT}`, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [inlinePortal],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const DIVISIONS = [
  { id: 'd-layer', kind: 'layer' },
  { id: 'd-mill', kind: 'feed_mill' },
  { id: 'd-broiler', kind: 'broiler' },
];

const member = (over) => ({
  id: 'm-1',
  userId: 'u-1',
  displayName: 'أبو علي',
  phone: '9647701234567',
  role: 'owner',
  accepted: true,
  invitedAt: Date.parse('2026-10-20T10:00:00Z'),
  divisionIds: [],
  ...over,
});

export default async function (t) {
  const m = await bundle(
    [
      "export { StaffTable, divisionsText, memberActions, listIsStale, roleIsStale, CodeDialog } from './src/pages/staff/StaffPage.tsx';",
      "export { InviteCard, mayHaveJoined, mayHaveDeclined, newInvites } from './src/pages/welcome/WelcomePage.tsx';",
      "export { default as AccountPage } from './src/pages/account/AccountPage.tsx';",
      "export { sessionStore } from './src/lib/session.tsx';",
      "export * from './src/lib/errors.ts';",
      "export { default as AuthPage, validateAuth } from './src/pages/auth/AuthPage.tsx';",
      "export { MemoryRouter } from 'react-router-dom';",
    ].join('\n'),
  );
  const render = (element) => m.renderToStaticMarkup(element);

  // ── جدول الموظفين ────────────────────────────────────────────────────────────────────────────────
  const rows = [
    member({}),
    member({ id: 'm-2', userId: 'u-2', displayName: 'حسن', role: 'hall_worker', accepted: false, divisionIds: ['d-broiler', 'd-mill'] }),
    member({ id: 'm-3', userId: 'u-3', displayName: 'المدير', role: 'manager', phone: null }),
    member({ id: 'm-4', userId: 'u-4', displayName: 'المشاهد', role: 'viewer' }),
  ];
  const withActions = render(m.h(m.StaffTable, { rows, divisions: DIVISIONS, selfUserId: 'u-1', onOpen: () => {} }));
  t.ok(withActions.includes('أبو علي (أنت)'), 'صفّ المالك نفسه معلَّم «(أنت)»');
  t.ok(withActions.includes('<bdi dir="ltr">0770 123 4567</bdi>'), 'الرقم بشكله المكتوب LTR، بلا فواصل آلاف');
  t.ok(!withActions.includes('9,647'), 'ماكو فواصل آلاف بالرقم');
  t.ok(withActions.includes('عامل القاعة') && withActions.includes('بانتظار القبول') && withActions.includes('يعمل'), 'الدور والحالة بأسمائهما');
  t.ok(withActions.includes('معمل العلف، حقول اللحم'), 'الوحدات بترتيب الوحدات الست وفاصل عربي');
  t.eq(m.divisionsText(rows[2], DIVISIONS), 'كل الوحدات', 'المدير بلا نطاق: كل الوحدات (مثل inScope)');
  t.eq(m.divisionsText(rows[3], DIVISIONS), 'لا وحدة', 'المشاهد بلا نطاق: لا وحدة');
  t.eq((withActions.match(/data-action="member-actions"/g) ?? []).length, 4, 'زرّ إجراءات لكل صفّ');
  t.ok(withActions.includes('إجراءات</th>') && withActions.indexOf('إجراءات</th>') < withActions.indexOf('الاسم</th>'), 'الإجراءات أوّل عمود (يمين الجدول): بالموبايل ما تبقى برّا الشاشة');
  t.ok(withActions.includes('aria-label="إجراءات حسن"'), 'زرّ الإجراءات يسمّي الموظف للقارئ الصوتي');
  const at = (over) => m.memberActions(member(over), 'u-1');
  t.same(at({ id: 'm-2', userId: 'u-2', role: 'hall_worker', accepted: false }), ['reissue', 'role', 'scopes', 'archive'], 'مدعوّ ما قبل: رمز جديد والدور والوحدات والأرشفة');
  t.same(at({ id: 'm-5', userId: 'u-5', role: 'manager' }), ['role', 'scopes', 'archive'], '«رمز جديد» للمدعوّ اللي ما قبل بس');
  t.same(at({}), ['role'], 'المالك نفسه: بلا وحدات (يرى كلّها) وبلا أرشفة نفسه (الخروج من «حسابي»)');
  t.same(at({ id: 'm-6', userId: 'u-6' }), ['role', 'archive'], 'مالك ثانٍ: بلا وحدات');
  t.eq(m.divisionsText({ role: 'owner', divisionIds: ['d-mill'] }, DIVISIONS), 'كل الوحدات', 'مالك بصفوف نطاق قديمة: كل الوحدات (in_scope_division للمالك دائماً)');
  t.ok(m.listIsStale(new m.UnknownOutcomeError()) && m.listIsStale(new m.RejectedError('already_in_org', 'h')) && m.listIsStale(new m.RejectedError('member_not_found', 'h')), 'نتيجة مجهولة أو «القائمة قديمة»: القائمة تتحدّث');
  t.ok(!m.listIsStale(new m.RejectedError('last_owner', 'h')) && !m.listIsStale(new m.NetworkError()), 'رفض عادي أو ما وصل: القائمة ما تحتاج تحديث');
  t.ok(m.mayHaveJoined(new m.UnknownOutcomeError()) && m.mayHaveJoined(new m.RejectedError('invite_not_found', 'h')) && m.mayHaveJoined(new m.RejectedError('already_member', 'h')), 'قبول أو إنشاء ممكن صار: الهويّة تتأكّد');
  t.ok(!m.mayHaveJoined(new m.RejectedError('invite_code_expired', 'h')), 'رمز منتهٍ: ما صار شي');
  t.eq(m.describeError(new m.UnknownOutcomeError(), 'read').title, 'لم يصل ردّ الخادم', 'القراءة المجهولة: «لم يصل ردّ الخادم»، مو «نتيجة العملية»');
  const readRetry = m.describeError(new m.RetryableError('55P03'), 'read');
  t.ok(
    readRetry.kind === 'retryable' && readRetry.title === 'تعذّر التحميل، أعد المحاولة' && !readRetry.title.includes('يُرحَّل') && !readRetry.detail.includes('لم يُحفظ'),
    'قراءة بقفل متزاحم: «تعذّر التحميل، أعد المحاولة»، مو «لم يُرحَّل» ولا «لم يُحفظ شيء»',
  );
  t.ok(m.describeError(new m.UnknownOutcomeError(), 'once').detail.includes('تحقّق قبل') && !m.describeError(new m.UnknownOutcomeError(), 'once').detail.includes('لن تتكرّر'), 'كتابة بلا مرجع: «تحقّق قبل الإعادة»، بلا وعد إنها ما تتكرّر');
  // createPortal مبدّل بالعقدة نفسها (inlinePortal)، بس معامله document.body ينحسب: هدف وهمي يكفي.
  globalThis.document = { body: null };
  const codeDialog = render(m.h(m.CodeDialog, { name: 'حسن', code: '012345', onClose: () => {} }));
  t.ok(m.roleIsStale(new m.RejectedError('forbidden', 'h')) && !m.roleIsStale(new m.RejectedError('last_owner', 'h')), 'forbidden: دور الداخل نفسه تغيّر، فالجلسة تتأكّد');
  t.ok(m.mayHaveDeclined(new m.UnknownOutcomeError()) && m.mayHaveDeclined(new m.RejectedError('invite_not_found', 'h')) && !m.mayHaveDeclined(new m.RejectedError('forbidden', 'h')), 'رفض دعوة ممكن صار: الشاشة تتحدّث');
  const inv = (memberId) => ({ memberId, orgName: 'م', role: 'viewer', displayName: 'س', invitedAt: 1 });
  t.same(m.newInvites([inv('a')], [inv('b')]).map((x) => x.memberId), ['b'], 'دعوة سُحبت وجت غيرها (نفس العدد): الجديدة تنحسب');
  t.same(m.newInvites([inv('a'), inv('b')], [inv('a')]), [], 'دعوة سُحبت بس: ماكو جديد');
  const readRejected = m.describeError(new m.RejectedError('PGRST116', null), 'read');
  t.ok(readRejected.title === 'تعذّر التحميل' && !readRejected.detail.includes('لم يُحفظ'), 'قراءة رجعت رفضاً بلا تلميح: «تعذّر التحميل»، مو «رفض العملية، لم يُحفظ شيء»');
  t.eq(m.describeError(new m.RejectedError('forbidden', 'لمالك المنشأة فقط.'), 'read').detail, 'لمالك المنشأة فقط.', 'وبتلميح الخادم: التلميح نفسه');
  delete globalThis.document;
  t.ok(codeDialog.includes('012 345') && !codeDialog.includes('data-action="dialog-close"'), 'رمز الدعوة: بلا X، ينسدّ من «تمّ» بس');
  t.ok(withActions.includes('<td') && withActions.includes('—'), 'رقم غايب «—»');
  const readOnly = render(m.h(m.StaffTable, { rows, divisions: DIVISIONS, selfUserId: 'u-1' }));
  t.ok(!readOnly.includes('data-action="member-actions"') && !readOnly.includes('إجراءات'), 'بلا صلاحية: ماكو عمود إجراءات');
  const empty = render(m.h(m.StaffTable, { rows: [], divisions: DIVISIONS, selfUserId: 'u-1' }));
  t.ok(empty.includes('لا موظفين غيرك بعد'), 'القائمة الفارغة تكول شنو يسوي');

  // ── حسابي: الاسم المسموع يبدي بالنصّ الظاهر (WCAG 2.5.3) ───────────────────────────────────────────
  m.sessionStore.set({
    status: 'ready',
    offline: false,
    workspace: {
      userId: 'u-1', orgId: 'o-1', orgName: 'مزرعة الأمل', memberId: 'm-1', displayName: 'أبو علي', phone: '9647701234567', role: 'manager',
      scopes: [], divisions: [], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, subscription: 'unknown', confirmedAt: 1,
      invites: [{ memberId: 'm-9', orgName: 'مزرعة النور', role: 'viewer', displayName: 'أبو علي', invitedAt: 1 }],
    },
  });
  const account = render(m.h(m.AccountPage));
  t.ok(account.includes('aria-label="ارفض واحظر المنشأة: مزرعة النور"') && account.includes('aria-label="ارفض دعوة مزرعة النور"'), 'زرّا الدعوة يسمّيان المنشأة ويبديان بالنصّ الظاهر');
  m.sessionStore.set({ status: 'not_configured' });

  // ── بطاقة الدعوة ─────────────────────────────────────────────────────────────────────────────────
  const invite = { memberId: 'm-9', orgName: 'مزرعة الأمل', role: 'hall_worker', displayName: 'حسن', invitedAt: Date.parse('2026-10-24T12:00:00') };
  const card = render(m.h(m.InviteCard, { invite, onAsk: () => {} }));
  t.ok(card.includes('دعوة من مزرعة الأمل'), 'الدعوة باسم المنشأة');
  t.ok(card.includes('عامل القاعة') && card.includes('حسن'), 'بالدور والاسم');
  t.ok(/<span dir="ltr"[^>]*>24\/10\/2026<\/span>/.test(card), 'تاريخ الدعوة DD/MM/YYYY معزول LTR');
  t.ok(/inputMode="numeric"/.test(card) && /autoComplete="one-time-code"/.test(card), 'حقل الرمز أرقام (لوحة أرقام بالموبايل)');
  t.ok(card.includes('data-action="accept-invite"') && card.includes('data-action="decline-invite"') && card.includes('data-action="block-invite"'), 'قبول ورفض ورفض وحظر');

  // ── الدخول ───────────────────────────────────────────────────────────────────────────────────────
  t.same(Object.keys(m.validateAuth('sign_in', '07701234567', 'secret123', '')), [], 'رقم صحيح وكلمة سرّ كافية: ماكو خطأ');
  t.same(Object.keys(m.validateAuth('sign_in', '٠٧٧٠١٢٣٤٥٦٧', 'secret123', '')), [], 'الأرقام الشرقية رقم صحيح');
  t.same(Object.keys(m.validateAuth('sign_in', '12345', 'short', '')).sort(), ['password', 'phone'], 'رقم غلط وكلمة سرّ قصيرة');
  t.same(Object.keys(m.validateAuth('sign_up', '07701234567', 'secret123', 'secret124')), ['repeat'], 'حساب جديد: كلمتا السرّ لازم تتطابقان');
  t.same([Object.keys(m.validateAuth('sign_up', ' Ali@Gmail.com ', 'secret123', 'secret123')), Object.keys(m.validateAuth('sign_in', 'ali@gmail', 'secret123', ''))], [[], ['phone']], 'البريد الحقيقي يُقبل اسم دخول (كلمة المالك 2026-10-30)، والناقص يُرفض');
  const page = render(m.h(m.MemoryRouter, null, m.h(m.AuthPage)));
  t.ok(page.includes('autoComplete="username"') && page.includes('autoComplete="current-password"'), 'حقلا الدخول بإكمال المتصفّح الصحيح');
  t.ok(page.includes('inputMode="email"') && page.includes('dir="ltr"'), 'اسم الدخول (بريد أو رقم) حقل LTR بلوحة البريد');
  t.ok(page.includes('data-action="sign-in"'), 'زرّ الدخول');
  // انمسك بالمتصفّح: «مثل 0770 123 4567» بسطر عربي انعرض «4567 123 0770». الرقم المقطّع بمسافات يتعزل LTR.
  t.ok(page.includes('مثل <bdi dir="ltr">name@gmail.com</bdi>'), 'مثال البريد معزول LTR بالتلميح');
}
