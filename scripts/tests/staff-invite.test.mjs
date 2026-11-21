// دعوة موظف (خطّة المرحلة 1 WP2): الدعوة نداء واحد (add_member_v2)، والرمز ما يصدر إلا بعد ما الدعوة انحفظت. «الكلّ مثل المالك
// بكلّ شيء» (كلمة المالك 2026-11-21، 0034): النطاق لا يحدّ شيئاً، فالدعوة بلا نطاق لكلّ دور (قوائم فارغة). inviteMember من
// StaffPage.tsx الحقيقي، وملفّات repo والتنبيه بدائل تسجّل النداءات بالترتيب.
// وصفحة الموظفين كلّها (react-dom/client الحقيقي على dom.mjs، والجلسة بديل): إدارة الموظفين للمالك وحده بعد 0034 — المالك يرى «ادعُ موظفاً»
// وإجراءات كلّ صفّ (غيّر الدور، أرشفة)، وكلّ دور غيره يرى جملة «لمالك المنشأة فقط» بلا دعوة ولا إجراءات (طفرة can(role, 'read') تفشله).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// كل بديل يسجّل بـglobalThis.__invite (يرجع كما كان بـfinally، درس 2026-10-26).
const STUBS = {
  // members.ts ملف كسول من المرحلة 1 WP3 (StaffPage يستورده مباشرةً، مو من index).
  repo: "const r = (name) => (...args) => globalThis.__invite.call('members.' + name, args); export const addMember = r('addMember'); export const inviteCode = r('inviteCode'); export const loadStaff = r('loadStaff'); export const setMemberRole = r('setMemberRole'); export const archiveMember = r('archiveMember');",
  scopes: "const r = (name) => (...args) => globalThis.__invite.call('scopes.' + name, args); export const addMemberV2 = r('addMemberV2'); export const setMemberScopesV2 = r('setMemberScopesV2'); export const loadScopeTargets = r('loadScopeTargets');",
  toast: "export const toast = (...args) => globalThis.__invite.call('toast', args);",
  session: 'export const useSession = () => globalThis.__invite.session; export const session = { refresh: async () => {} };',
};

const stubs = {
  name: 'invite-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/repo\/members$|\/lib\/repo\/scopes$|\/components\/ui\/Toast$|\/lib\/session$/ }, (args) => {
      if (!args.importer.replace(/\\/g, '/').endsWith('src/pages/staff/StaffPage.tsx')) return undefined;
      const kind = args.path.endsWith('/scopes') ? 'scopes' : args.path.endsWith('/Toast') ? 'toast' : args.path.endsWith('/session') ? 'session' : 'repo';
      return { path: kind, namespace: 'invite-stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'invite-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT }));
  },
};

async function bundle() {
  const entry = [
    "export { inviteMember, default as StaffPage } from './src/pages/staff/StaffPage.tsx';",
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter } from 'react-router-dom';",
    "export { ROLES } from './src/domain/permissions.ts';",
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [stubs],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

export default async function (t) {
  const m = await bundle();
  const before = globalThis.__invite;
  try {
    /** يشغّل الدعوة ببدائل: answers[اسم] قيمة أو Error يرمى. يرجّع النداءات والنتيجة (أو الخطأ). */
    const run = async (form, answers) => {
      const calls = [];
      globalThis.__invite = {
        call: async (name, args) => {
          calls.push([name, args]);
          const answer = answers[name];
          if (answer instanceof Error) throw answer;
          return answer;
        },
      };
      try {
        return { calls, result: await m.inviteMember(form) };
      } catch (error) {
        return { calls, error: error.message };
      }
    };
    const accountant = { phone: '07701234567', role: 'accountant', name: 'محاسب الأدوية' };

    // الدعوة تفشل: ولا رمز يصدر.
    const failed = await run(accountant, { 'scopes.addMemberV2': new Error('lock_not_available') });
    t.eq(failed.error, 'lock_not_available', 'فشل الدعوة يوصل الشاشة كما هو (خطأ مانع، مو تنبيه ويكمل)');
    t.same(failed.calls.map(([name]) => name), ['scopes.addMemberV2'], 'نداء واحد بس: ولا add_member قبله ولا رمز دعوة بعده');

    // الناجح: نداء واحد بقوائم فارغة، ثم الرمز.
    const ok = await run(accountant, { 'scopes.addMemberV2': 'm-new', 'members.inviteCode': '012345' });
    t.same(ok.result, { memberId: 'm-new', code: '012345' }, 'الدعوة ثم رمزها');
    t.same(
      ok.calls,
      [
        ['scopes.addMemberV2', ['07701234567', 'accountant', 'محاسب الأدوية', { divisionIds: [], siteIds: [], warehouseIds: [] }]],
        ['members.inviteCode', ['m-new']],
      ],
      'add_member_v2 بلا نطاق، وبعده invite_code',
    );

    // كلّ دور بلا نطاق (عامل القاعة كالمالك).
    const worker = await run({ ...accountant, role: 'hall_worker' }, { 'scopes.addMemberV2': 'm-hw', 'members.inviteCode': '111111' });
    t.same(worker.calls[0], ['scopes.addMemberV2', ['07701234567', 'hall_worker', 'محاسب الأدوية', { divisionIds: [], siteIds: [], warehouseIds: [] }]], 'دعوة عامل قاعة: بلا نطاق');

    // الرمز وحده يفشل: الدعوة محفوظة، والرمز يصدر بعدين من «رمز جديد» (تنبيه، والنتيجة بلا رمز).
    const noCode = await run(accountant, { 'scopes.addMemberV2': 'm-new', 'members.inviteCode': new Error('offline') });
    t.same([noCode.result, noCode.calls.map(([name]) => name)], [{ memberId: 'm-new', code: null }, ['scopes.addMemberV2', 'members.inviteCode', 'toast']], 'فشل الرمز بعد دعوة محفوظة: تنبيه، وبلا رمز');
  } finally {
    globalThis.__invite = before;
  }
  await staffPageGate(t, m);
}

/** الصفحة كلّها لكلّ دور بجواب قائمة واحد: «ادعُ موظفاً» وإجراءات الصفوف (غيّر الدور، أرشفة) للمالك وحده (members.manage). */
async function staffPageGate(t, m) {
  const restore = installDom();
  const before = globalThis.__invite;
  const body = () => globalThis.document.body;
  const byAction = (name) => descendants(body()).filter((node) => node.getAttribute('data-action') === name);
  const row = (id, userId, name, role) => ({ id, userId, displayName: name, phone: '07701234567', role, accepted: true, invitedAt: 1, divisionIds: [], siteIds: [], warehouseIds: [] });
  const list = { members: [row('m-1', 'u-me', 'علي', 'owner'), row('m-2', 'u-2', 'حسن', 'hall_worker')], divisions: [] };
  const OWNER_ONLY = 'إدارة الموظفين لمالك المنشأة فقط';
  let root = null;
  try {
    for (const role of m.ROLES) {
      const calls = [];
      globalThis.__invite = {
        session: { status: 'ready', workspace: { userId: 'u-me', orgId: 'org-1', orgName: 'مزرعة', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['general'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1 }, offline: false },
        call: async (name, args) => {
          calls.push([name, args]);
          return name === 'members.loadStaff' ? list : null;
        },
      };
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, null, m.h(m.StaffPage))));
      await settle();
      const seen = { invite: byAction('invite-member').length, rows: byAction('member-actions').length, notice: body().textContent.includes(OWNER_ONLY) };
      // إجراءات صفّ الموظف الآخر (حسن): «غيّر الدور» و«أرشفة».
      const worker = byAction('member-actions').find((node) => (node.getAttribute('aria-label') ?? '').includes('حسن'));
      if (worker) {
        fire(worker, 'click');
        await settle();
      }
      Object.assign(seen, { role: byAction('member-role').length, archive: byAction('member-archive').length });
      const expected = role === 'owner' ? { invite: 1, rows: 2, notice: false, role: 1, archive: 1 } : { invite: 0, rows: 0, notice: true, role: 0, archive: 0 };
      t.same(
        seen,
        expected,
        role === 'owner'
          ? 'صفحة الموظفين للمالك: «ادعُ موظفاً» وإجراءات كلّ صفّ، و«غيّر الدور» و«أرشفة» للموظف'
          : `صفحة الموظفين لـ${role}: جملة «${OWNER_ONLY}» بلا «ادعُ موظفاً» ولا إجراءات صفّ ولا تغيير دور ولا أرشفة (0034: إدارة الموظفين للمالك وحده)`,
      );
      m.flushSync(() => root.unmount());
      root = null;
      body().textContent = '';
      await settle();
    }
  } finally {
    if (root) m.flushSync(() => root.unmount());
    globalThis.__invite = before;
    restore();
  }
}
