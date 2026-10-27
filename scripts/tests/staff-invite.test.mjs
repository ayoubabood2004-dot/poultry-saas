// دعوة موظف بنطاق موقع أو مخزن (خطّة المرحلة 1 WP2، FOUNDATION ٢٤٥ و٥٤٤): الدعوة ونطاقها نداء واحد (add_member_v2)،
// فما تبقى دعوة بلا نطاق لو فشل نداء ثانٍ (المدير والمحاسب بلا صفوف نطاق = كل المنشأة)، والرمز ما يصدر إلا بعد ما الدعوة
// ونطاقها انحفظوا سوا. inviteMember من StaffPage.tsx الحقيقي، وملفّات repo والتنبيه بدائل تسجّل النداءات بالترتيب.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// كل بديل يسجّل بـglobalThis.__invite (يرجع كما كان بـfinally، درس 2026-10-26).
const STUBS = {
  // members.ts ملف كسول من المرحلة 1 WP3 (StaffPage يستورده مباشرةً، مو من index).
  repo: "const r = (name) => (...args) => globalThis.__invite.call('members.' + name, args); export const addMember = r('addMember'); export const inviteCode = r('inviteCode'); export const loadStaff = r('loadStaff'); export const setMemberRole = r('setMemberRole'); export const archiveMember = r('archiveMember');",
  scopes: "const r = (name) => (...args) => globalThis.__invite.call('scopes.' + name, args); export const addMemberV2 = r('addMemberV2'); export const setMemberScopesV2 = r('setMemberScopesV2'); export const loadScopeTargets = r('loadScopeTargets');",
  toast: "export const toast = (...args) => globalThis.__invite.call('toast', args);",
};

const stubs = {
  name: 'invite-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/repo\/members$|\/lib\/repo\/scopes$|\/components\/ui\/Toast$/ }, (args) => {
      if (!args.importer.replace(/\\/g, '/').endsWith('src/pages/staff/StaffPage.tsx')) return undefined;
      const kind = args.path.endsWith('/scopes') ? 'scopes' : args.path.endsWith('/Toast') ? 'toast' : 'repo';
      return { path: kind, namespace: 'invite-stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'invite-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT }));
  },
};

async function bundle() {
  const result = await build({
    stdin: { contents: "export { inviteMember } from './src/pages/staff/StaffPage.tsx';", resolveDir: ROOT, loader: 'tsx' },
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
    const accountant = { phone: '07701234567', role: 'accountant', name: 'محاسب الأدوية', scope: { divisionIds: [], siteIds: [], warehouseIds: ['w-med'] } };

    // نداء النطاق يفشل: ولا رمز يصدر، والدعوة ما تبقى بلا نطاق (هي والنطاق نداء واحد يفشل كلّه).
    const failed = await run(accountant, { 'scopes.addMemberV2': new Error('lock_not_available') });
    t.eq(failed.error, 'lock_not_available', 'فشل الدعوة يوصل الشاشة كما هو (خطأ مانع، مو تنبيه ويكمل)');
    t.same(failed.calls.map(([name]) => name), ['scopes.addMemberV2'], 'نداء واحد بس: ولا add_member قبله ولا رمز دعوة بعده');

    // الناجح: نداء واحد بالقوائم الثلاث، ثم الرمز.
    const ok = await run(accountant, { 'scopes.addMemberV2': 'm-new', 'members.inviteCode': '012345' });
    t.same(ok.result, { memberId: 'm-new', code: '012345' }, 'الدعوة ونطاقها ثم رمزها');
    t.same(
      ok.calls,
      [
        ['scopes.addMemberV2', ['07701234567', 'accountant', 'محاسب الأدوية', { divisionIds: [], siteIds: [], warehouseIds: ['w-med'] }]],
        ['members.inviteCode', ['m-new']],
      ],
      'add_member_v2 بالوحدات والمواقع والمخازن، وبعده invite_code',
    );

    // المالك يرى كل الوحدات: نطاقه ما ينبعث.
    const owner = await run({ ...accountant, role: 'owner' }, { 'scopes.addMemberV2': 'm-own', 'members.inviteCode': '111111' });
    t.same(owner.calls[0], ['scopes.addMemberV2', ['07701234567', 'owner', 'محاسب الأدوية', { divisionIds: [], siteIds: [], warehouseIds: [] }]], 'دعوة مالك: بلا نطاق');

    // الرمز وحده يفشل: الدعوة بنطاقها محفوظة، والرمز يصدر بعدين من «رمز جديد» (تنبيه، والنتيجة بلا رمز).
    const noCode = await run(accountant, { 'scopes.addMemberV2': 'm-new', 'members.inviteCode': new Error('offline') });
    t.same([noCode.result, noCode.calls.map(([name]) => name)], [{ memberId: 'm-new', code: null }, ['scopes.addMemberV2', 'members.inviteCode', 'toast']], 'فشل الرمز بعد دعوة محفوظة: تنبيه، وبلا رمز');
  } finally {
    globalThis.__invite = before;
  }
}
