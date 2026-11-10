// أداة فحوص شاشات الذمم والكشف والسندات وصفحة البيع (عقد 0024، الوكيل ب): react-dom/client الحقيقي على DOM صغير (dom.mjs) يرسم الصفحات
// الحقيقية من src/ محزومة بـesbuild، وملفّات repo الحقيقية (المحلّلات وبناء النداءات) على core بديل: call يسجّل كلّ نداء دالّة ويجيب من
// globalThis.__mb.rpc، وsend (قراءة جداول الإعداد: الدفاتر والأقسام) يجيب من globalThis.__mb.tables بمنشئ استعلام بديل. والجلسة بديل.
// ليس ملف فحص (لا ينتهي بـ.test.mjs): يستورده debts-screens.test وstatement-screens.test.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle } from './dom.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'money-b.json'), 'utf8'));
export const clone = (value) => JSON.parse(JSON.stringify(value));
export { descendants, fire, settle };

const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const SESSION_STUB = 'export const useSession = () => globalThis.__mb.session; export const sessionStore = { get: () => globalThis.__mb?.session ?? { status: "loading" } };';
// core بديل لملفّات repo وحدها: call وsend من globalThis.__mb، والملفّ الحقيقي يبني الطلب ويقرأ الجواب.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__mb.rpc(fn, args);
export const send = async (make) => ({ result: await make(globalThis.__mb.db()), wasOnline: true });
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const stubs = {
  name: 'money-b-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$/ }, () => ({ path: 'session', namespace: 'money-b-stub' }));
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'money-b-stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'money-b-stub' }, (args) => ({ contents: args.path === 'core' ? CORE : SESSION_STUB, resolveDir: ROOT, loader: 'js' }));
    // CSS الأوراق يستورده AccountsRoutes وحده؛ وإن استورده ملف هنا فلا ناتج له في الحزمة.
    b.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'money-b-css' }));
    b.onLoad({ filter: /.*/, namespace: 'money-b-css' }, () => ({ contents: '', loader: 'js' }));
  },
};

export async function bundle(exports) {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    ...exports,
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

/** منشئ استعلام PostgREST بديل: كلّ سلسلة تعود بصفوف جدولها من tables. */
function fakeDb(tables) {
  return {
    from(table) {
      const rows = tables[table] ?? [];
      const query = {
        then(resolve, reject) {
          return Promise.resolve({ data: clone(rows), error: null, status: 200, count: rows.length }).then(resolve, reject);
        },
      };
      for (const method of ['select', 'is', 'eq', 'like', 'ilike', 'order', 'limit', 'in', 'gte', 'lte', 'lt', 'gt', 'neq', 'not']) query[method] = () => query;
      return query;
    },
    rpc() {
      return Promise.resolve({ data: null, error: { code: 'x' }, status: 400 });
    },
  };
}

/** جداول الإعداد من دفاتر عيّنة debts_overview (الحسابات بأقسامها). */
export function setupTables(books) {
  const divisions = new Map(books.map((book) => [book.division_id, { id: book.division_id, kind: book.division_kind, go_live_on: null }]));
  return {
    ledger_books: books.map((book) => ({ id: book.book_id, division_id: book.division_id, code: book.code, name: book.name })),
    divisions: [...divisions.values()],
    parties: [],
  };
}

export const SESSION = (role, over = {}) => ({
  status: 'ready',
  workspace: { userId: 'u-1', orgId: 'org-1', orgName: 'منشأة', memberId: 'm-1', displayName: 'عضو', phone: null, role, scopes: [], divisions: [], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 0, ...over },
});

// ── أدوات DOM ──────────────────────────────────────────────────────────────────────────────────────────────────
export const body = () => globalThis.document.body;
export const all = () => descendants(body());
export const byAction = (name, scope = body()) => descendants(scope).filter((n) => n.getAttribute('data-action') === name);
export const first = (name, scope) => byAction(name, scope)[0] ?? null;
export const text = (node = body()) => (node ? node.textContent : '');
export const click = async (node) => {
  if (node) fire(node, 'click');
  await settle();
};
/** قيمة حقل كما يكتبها المستخدم (React يقرأ value من العقدة عند input). */
export const typeIn = async (node, value) => {
  if (!node) return;
  node.value = value;
  fire(node, 'input');
  await settle();
};
export const choose = async (node, value) => {
  if (!node) return;
  node.value = value;
  fire(node, 'change');
  await settle();
};
/** جدول بعقدته: رؤوس الأعمدة وصفوف الجسم (خلايا نصوصاً) وصفوف التذييل. */
export const tableOf = (tableNode) => {
  // أقسام الجدول نفسه (أبناؤه المباشرون): جداول الموادّ المتداخلة تحت سطور الكشف لها أقسامها.
  const section = (tag) => (tableNode?.children ?? []).find((n) => n.localName === tag);
  const rows = (tag) => (section(tag)?.children ?? []).filter((n) => n.localName === 'tr');
  return {
    headers: (section('thead') ? descendants(section('thead')) : []).filter((n) => n.localName === 'th').map((n) => n.textContent),
    rows: rows('tbody'),
    body: rows('tbody').map((tr) => tr.children.map((c) => c.textContent)),
    foot: rows('tfoot').map((tr) => tr.children.map((c) => c.textContent)),
  };
};
/** الجداول (عقد table) تحت عقدة، بترتيبها. */
export const tablesIn = (scope) => descendants(scope).filter((n) => n.localName === 'table');

// ── حساب مستقلّ عن الشاشة ─────────────────────────────────────────────────────────────────────────────────────
/** نصّ عشريّ ← عدد صحيح بالمقياس (المال 2، الكمية 3). */
export const scaledOf = (value, scale) => {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const units = BigInt(`${whole}${fraction.padEnd(scale, '0').slice(0, scale)}`);
  return negative ? -units : units;
};
export const fils = (value) => scaledOf(value, 2);
export const milli = (value) => scaledOf(value, 3);
const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** المبلغ كما تعرضه الأوراق: بفواصل، وبمرتبتين إذا فيه فلوس. */
export const money = (amount) => {
  const abs = amount < 0n ? -amount : amount;
  const text = abs % 100n === 0n ? group((abs / 100n).toString()) : `${group((abs / 100n).toString())}.${(abs % 100n).toString().padStart(2, '0')}`;
  return amount < 0n ? `-${text}` : text;
};
export const fmtDay = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
/** الكمية بكلّ مراتبها المعنوية لحدّ ثلاث (fmtMilli). */
export const qtyText = (value) => {
  const units = milli(value);
  const whole = group((units / 1000n).toString());
  const fraction = (units % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};
export const side = (amount) => (amount > 0n ? 'عليه' : amount < 0n ? 'له' : '');
export const BOOK_LABEL = { feed_mill: 'معمل العلف', broiler: 'حقول اللحم', layer: 'حقول البيض', medicine: 'مخزن الأدوية', general: 'المخازن العامة' };
export const bookName = (book) => (book.code === 'chicks' ? 'المفقس: الأفراخ' : book.code === 'hatching_eggs' ? 'المفقس: بيض التفقيس' : BOOK_LABEL[book.division_kind]);
export const bucketOf = (days) => (days <= 30 ? 'd0_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd91_plus');
export const BUCKETS = ['d0_30', 'd31_60', 'd61_90', 'd91_plus'];
export const daysWord = (n) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n % 100 >= 3 && n % 100 <= 10 ? `${group(String(n))} أيام` : n % 100 >= 11 ? `${group(String(n))} يوماً` : `${group(String(n))} يوم`);

/** بيئة الفحص: DOM وجلسة ونداءات مسجّلة، وتركيب صفحة بمسارها، وإرجاع كلّ شيء كما كان. */
export function createEnv(m) {
  let root = null;
  let where = null;
  const state = { rpcCalls: [] };
  function Probe() {
    where = m.useLocation();
    return null;
  }
  const fresh = ({ session, rpc = {}, tables = {} }) => {
    state.rpcCalls = [];
    globalThis.__mb = {
      session,
      db: () => fakeDb(tables),
      rpc(fn, args) {
        state.rpcCalls.push([fn, args]);
        const handler = rpc[fn];
        if (!handler) return new Promise(() => {});
        return Promise.resolve().then(() => handler(args, state.rpcCalls.filter(([name]) => name === fn).length));
      },
    };
  };
  const mount = async (url, routes) => {
    const container = globalThis.document.createElement('div');
    body().appendChild(container);
    root = m.createRoot(container);
    m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Probe), m.h(m.Routes, null, ...routes.map(([pattern, element]) => m.h(m.Route, { key: pattern, path: pattern, element: m.h(element) }))))));
    await settle();
    await settle();
  };
  const unmount = async () => {
    if (!root) return;
    const mounted = root;
    root = null;
    m.flushSync(() => mounted.unmount());
    body().textContent = '';
    await settle();
  };
  return {
    state,
    fresh,
    mount,
    unmount,
    calls: (fn) => state.rpcCalls.filter(([name]) => name === fn).map(([, args]) => args),
    location: () => where,
    search: () => Object.fromEntries(new URLSearchParams(where?.search ?? '')),
  };
}

export { Element, installDom };
