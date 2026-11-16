// أدوات فحوص شاشات 0028 للقاعات (halls-tickets وhalls-close): حزمة المصدر الحقيقي (HallsRoutes وبطاقة الفوج والتذكير وصفحة «التقارير» والمحلّلات)
// بـesbuild على core بديل يسجّل كلّ نداء (__h8.rpc) ويجيب بأجوبة العقد (fixtures/halls-close-contract.json، مكتوبة باليد قبل الهجرة)، وجلسة وتنبيه
// بديلان. وكلّ نداء لـbundle نسخة جديدة من الوحدات (ذاكرة جديدة = إعادة تحميل الصفحة)، وsessionStorage وlocalStorage بالذاكرة يبقيان بين النسختين.
// مو ملف فحص (ما ينتهي بـ.test.mjs).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, settle } from './dom.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-close-contract.json'), 'utf8'));
export const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));

const STUBS = {
  session: 'export const useSession = () => globalThis.__h8.session; export const sessionStore = { get: () => globalThis.__h8?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__h8.toasts.push(spec); }; export function Toaster() { return null; }',
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__h8.rpc(fn, args);
export const send = async () => { throw new Error('h8: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ userId: globalThis.__h8?.session?.workspace?.userId ?? null, db: null });
export const unknownConstraint = () => '';`;
const plugins = [
  {
    name: 'h8-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'h8-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'h8-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'h8-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'h8-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
    },
  },
];

let bundles = 0;
/** الحزمة كلّها؛ وكلّ نداء نسخة جديدة منها (تعليق بعدّادها يجعل عنوان data: جديداً). */
export async function bundle(name) {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';",
    "export { default as HallsRoutes, Reminders, FlockCard } from './src/pages/halls/HallsRoutes.tsx';",
    "export { default as ReportsPage } from './src/pages/reports/ReportsPage.tsx';",
    "export * as tickets from './src/lib/repo/weighTickets.ts';",
    "export * as close from './src/lib/repo/flockClose.ts';",
    "export * as halls from './src/lib/repo/halls.ts';",
    "export * as days from './src/lib/repo/hallReports.ts';",
    "export { CLOSE_CONSTRAINT_HINTS } from './src/lib/repo/constraints-close.ts';",
    "export { ticketBack, ticketBackLabel, signedCount, ticketsCount, newTicketPath } from './src/pages/halls/ticketParts.tsx';",
    "export * as ticketParts from './src/pages/halls/ticketParts.tsx';",
    "export { pendingKey, storePending } from './src/pages/halls/GivePage.tsx';",
    "export { dayShareText } from './src/pages/halls/DailyPage.tsx';",
    "export { qtyText } from './src/pages/halls/parts.tsx';",
    "export { fmtDay } from './src/lib/format.ts';",
    "export { localDay, addDays } from './src/domain/dates.ts';",
    "export { RejectedError, UnknownOutcomeError, NetworkError } from './src/lib/errors.ts';",
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
    plugins,
  });
  bundles += 1;
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// ${name} bundle ${bundles}\n`).toString('base64')}`);
}

/** تخزين بالذاكرة (sessionStorage أو localStorage) يبقى بين نسختي الحزمة كما يبقى بعد إعادة التحميل. */
export function memoryStorage() {
  const map = new Map();
  return { map, api: { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), clear: () => map.clear() } };
}

export const body = () => globalThis.document.body;
export const all = () => descendants(body());
export const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
export const within = (node, name) => (node ? descendants(node).filter((n) => n.getAttribute('data-action') === name) : []);
export const withAttr = (action, attr, value) => byAction(action).find((n) => n.getAttribute(attr) === value) ?? null;
export const textOf = (action) => byAction(action)[0]?.textContent ?? null;
export const text = () => body().textContent;
export const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
export const href = (node) => node?.getAttribute('href') ?? null;
export const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
export const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click', { button: 0 });
  await settle();
};
export const select = (node, value) => {
  if (!node) throw new Error('no select');
  node.value = value;
  fire(node, 'change');
};
/** القيمة المختارة في <select> مضبوط (React يؤشّر خياره selected). */
export const selected = (node) => node?.options.find((option) => option.selected)?.value ?? null;
export const dialog = () => all().filter((n) => n.getAttribute('role') === 'dialog').at(-1) ?? null;
export const byLabel = (label) => all().find((n) => n.getAttribute('aria-label') === label) ?? null;
export const buttonText = (label) => all().find((n) => n.localName === 'button' && n.textContent === label) ?? null;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export const LRI = '\u{2066}';
export const PDI = '\u{2069}';

/** صفوف جدول بعنوانه (caption): نصّ كلّ خلية. */
export const tableRows = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
export const tableFoot = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
  const tfoot = table ? descendants(table).find((n) => n.localName === 'tfoot') : null;
  return tfoot ? tfoot.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};

/** يكتب على لوحة الوزن في النافذة المفتوحة: المفاتيح بأسمائها (الفاصلة «فاصلة عشرية»)، ثمّ «اعتمد الوزن». */
export async function padType(digits, crates = null) {
  const box = dialog();
  if (!box) throw new Error('no pad dialog');
  if (crates !== null) type(within(box, 'pad-crates')[0], crates);
  const clear = within(box, 'weight-clear')[0];
  if (clear && !clear.hasAttribute('disabled')) {
    fire(clear, 'click', { button: 0 });
    await settle(3);
  }
  for (const key of digits) {
    const label = key === '.' ? 'فاصلة عشرية' : key;
    const button = descendants(box).find((n) => n.localName === 'button' && n.getAttribute('aria-label') === label);
    if (!button) throw new Error(`no pad key ${key}`);
    fire(button, 'click', { button: 0 });
    // كلّ مفتاح بعد رسم ما قبله: اللوحة تحسب من القيمة المرسومة.
    await settle(3);
  }
  await settle();
  await click(within(dialog(), 'pad-commit')[0]);
  await settle(30);
}

export const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role),
  canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: !['hall_worker', 'mill_operator', 'hatchery_operator'].includes(role), invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
export const sessionOf = (role, over = {}) => ({ status: 'ready', workspace: ws(role, over), offline: false });
