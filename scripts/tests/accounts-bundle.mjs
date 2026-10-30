// رسم شاشات الحسابات بلا متصفّح من المصدر الحقيقي (esbuild): القراءات والجلسة بدائل (useLoad وuseSession)، والنافذة ترسم بمكانها
// (createPortal بديل). يستعمله accounts-screens.test (بالواجهة) وgolden.test (D4: أرقام الخادم الحقيقية بالصفحة المرسومة).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const REPO = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
// القراءة المسجّلة: الطلب بمعطياته بـglobalThis.__accounts.calls، ووعد ما يرجع (الشاشة تقرا من loads).
const recorded = (names) => names.map((name) => `export const ${name} = (...args) => { globalThis.__accounts.calls.push(['${name}', args]); return new Promise(() => {}); };`).join(' ');
const STUBS = {
  // capture: الشاشة تنادي قراءتها مرّة (بلا انتظار) حتى معطياتها تنسجّل؛ الرفض (القاعدة غير مربوطة) ينبلع.
  load: "export function useLoad(load, key = '') { const g = globalThis.__accounts; if (g.capture) { try { Promise.resolve(load()).catch(() => {}); } catch {} } const state = g.loads[key]; return { data: state?.data ?? null, error: state?.error ?? null, loading: !state, retry() {} }; }",
  session: 'export const useSession = () => globalThis.__accounts.session;',
  portal: 'export const createPortal = (node) => node;',
  parties: `export * from ${REPO('parties')}; ${recorded(['loadAccountsSummary', 'loadPartyBalances', 'loadStatement'])}`,
  cash: `export * from ${REPO('cash')}; ${recorded(['loadCashBalances', 'loadCashStatement'])}`,
};

const stubs = {
  name: 'accounts-stubs',
  setup(b) {
    const from = (args, suffix) => args.importer.replace(/\\/g, '/').includes(suffix);
    b.onResolve({ filter: /\/lib\/useLoad$|\/lib\/session$|\/lib\/repo\/(parties|cash)$/ }, (args) => {
      if (!from(args, 'src/pages/accounts/')) return undefined;
      const kind = args.path.split('/').at(-1);
      return { path: kind === 'useLoad' ? 'load' : kind, namespace: 'accounts-stub' };
    });
    b.onResolve({ filter: /^react-dom$/ }, (args) => (from(args, 'src/components/ui/Dialog.tsx') ? { path: 'portal', namespace: 'accounts-stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'accounts-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

export async function bundleAccounts(contents) {
  const result = await build({
    stdin: {
      contents: `${contents} export { renderToStaticMarkup } from 'react-dom/server.browser'; export { createElement as h } from 'react'; export { MemoryRouter } from 'react-router-dom';`,
      resolveDir: ROOT,
      loader: 'tsx',
    },
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

