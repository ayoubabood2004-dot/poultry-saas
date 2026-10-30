// مبالغ الاستلام بـrepo الشراء الحقيقي (مراجعة WP6): setLineTotal وsetReceiptAmounts وupdateCharge من purchasing.ts كما هي (written
// وsend وauthed وpostgrest-js) على خادم PostgREST مزيّف بالذاكرة يطبّق شروط eq/is على صفّ واحد. كل حالة كانت تفشل على الشفرة قبل
// إصلاحها (الكتابة كانت مطلقة بمعرّف الصفّ): A1 تعديل المبلغ مشروط بالمبلغ والسبب اللي شافتهم الشاشة، والسبب للصفر بس؛ A2 محاولة
// وصلت وضاع جوابها ← صفر صفوف والصفّ بالمطلوب = انكتب؛ A3 كاتب ثاني غيّره ← amount_changed بلا كتابة فوقه؛ A4 إدراج وصل وضاع
// جوابه (23505) = انكتب؛ A5 الخصم والمدفوع: الحقول المتغيّرة بس ومشروطة بالصفّ كما انقرا؛ A6 إعادة إضافة تحميل بعد 23505 تكتب آخر قيمه.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://fake.local/rest/v1', { fetch: (...a) => globalThis.__amountServer.fetch(...a) });
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' }, access_token: 'a' } }, error: null }), refreshSession: async () => ({ data: { session: {} }, error: null }) },
    from: (table) => rest.from(table),
    rpc: (fn, args) => rest.rpc(fn, args),
  };
}
export const STORED_SESSION = /^sb-.+-auth-token$/;
export function addAuthListener() { return () => {}; }
export async function dropClient() {}
`;

async function bundle() {
  const result = await build({
    stdin: { contents: "export { setLineTotal, setReceiptAmounts, updateCharge } from './src/lib/repo/purchasing.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins: [
      {
        name: 'amount-client',
        setup(b) {
          b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'amount-client' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'amount-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/** صفّ واحد (أو ماكو): POST يدرج أو 23505، وPATCH بشروط eq/is، وGET يرجّعه؛ و«الجواب يضيع» بعد ما يطبّق. */
function fakeServer(row) {
  const server = {
    row,
    requests: [],
    loseNextAnswer: false,
    async fetch(url, init) {
      const u = new URL(String(url));
      const body = init.body ? JSON.parse(init.body) : null;
      server.requests.push({ method: init.method, query: decodeURIComponent(u.search), body });
      const json = (rows) => new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
      const lose = () => {
        if (!server.loseNextAnswer) return false;
        server.loseNextAnswer = false;
        return true;
      };
      if (init.method === 'GET') return json(server.row ? [server.row] : []);
      if (init.method === 'POST') {
        if (server.row) return new Response(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }), { status: 409, headers: { 'content-type': 'application/json' } });
        server.row = { id: 'new', ...body };
        if (lose()) throw new TypeError('Failed to fetch');
        return json([server.row]);
      }
      if (init.method !== 'PATCH') throw new Error(`طلب غير متوقّع ${init.method}`);
      let match = server.row !== null;
      for (const [key, value] of u.searchParams) {
        if (key === 'select' || !match) continue;
        const [op, ...rest] = value.split('.');
        const arg = rest.join('.');
        const have = server.row[key];
        if (op === 'eq') match = have !== null && have !== undefined && (/^-?\d+(\.\d+)?$/u.test(arg) ? Number(have) === Number(arg) : String(have) === arg);
        else if (op === 'is') match = arg === 'null' && have === null;
        else throw new Error(`شرط غير معروف ${op}`);
      }
      if (match) Object.assign(server.row, body);
      if (lose()) throw new TypeError('Failed to fetch');
      return json(match ? [server.row] : []);
    },
  };
  return server;
}

export default async function (t) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  try {
    const m = await bundle();
    const outcome = (promise) => promise.then(() => 'ok', (error) => error.code ?? error.name);
    const gift = { id: 'la-1', lineId: 'L', lineTotal: 0n, zeroReason: 'هدية' };
    const amountRow = (over = {}) => ({ id: 'la-1', line_id: 'L', line_total: '0.00', zero_reason: 'هدية', ...over });

    // A1: من (0، «هدية») إلى 100 دينار: تعديل واحد مشروط بالاثنين، والسبب ينمسح (للصفر بس).
    {
      const server = (globalThis.__amountServer = fakeServer(amountRow()));
      const result = await outcome(m.setLineTotal('L', gift, 10_000n, 'هدية'));
      const [patch] = server.requests;
      t.same(
        [result, patch?.method, patch?.query.includes('line_total=eq.0.00'), patch?.query.includes('zero_reason=eq.هدية'), patch?.body, server.row.line_total],
        ['ok', 'PATCH', true, true, { line_total: '100.00', zero_reason: null }, '100.00'],
        'A1: مشروط بـline_total=eq.0.00 وzero_reason=eq.هدية، والسبب null للمبلغ غير الصفر',
      );
    }

    // A2: محاولة سابقة وصلت (الصفّ صار 100) وجوابها ضاع: الإعادة صفر صفوف، والقراءة تلقى المطلوب = انكتب.
    {
      const server = (globalThis.__amountServer = fakeServer(amountRow({ line_total: '100.00', zero_reason: null })));
      t.same([await outcome(m.setLineTotal('L', gift, 10_000n, null)), server.requests.map((r) => r.method)], ['ok', ['PATCH', 'GET']], 'A2: صفر صفوف ثم قراءة بالمطلوب = انكتب');
    }

    // A3: كاتب ثاني غيّره لـ250: رفض amount_changed، والصفّ باقٍ على قيمته.
    {
      const server = (globalThis.__amountServer = fakeServer(amountRow({ line_total: '250.00', zero_reason: null })));
      t.same([await outcome(m.setLineTotal('L', gift, 10_000n, null)), server.row.line_total], ['amount_changed', '250.00'], 'A3: amount_changed بلا كتابة فوق 250');
    }

    // A4: أوّل مبلغ (إدراج) وصل وضاع جوابه: الإعادة 23505، والقراءة تلقى المطلوب = انكتب.
    {
      const server = (globalThis.__amountServer = fakeServer(null));
      server.loseNextAnswer = true;
      const first = await outcome(m.setLineTotal('L', null, 5_000n, null));
      const again = await outcome(m.setLineTotal('L', null, 5_000n, null));
      t.same([first, again, server.requests.map((r) => r.method)], ['UnknownOutcomeError', 'ok', ['POST', 'POST', 'GET']], 'A4: الإعادة بعد جواب ضائع 23505 ثم قراءة = انكتب');
    }

    // A5: الخصم وحده تغيّر: الحمولة الخصم بس، والشرط الصفّ كما انقرا (الخصم والمدفوع والصندوق)؛ ومدفوع غيّره كاتب ثاني يوقفه.
    {
      const before = { id: 'ra-1', discount: 100_000n, paidNow: 50_000n, cashAccountId: 'box-1' };
      const row = (over = {}) => ({ id: 'ra-1', doc_id: 'd', discount: '1000.00', paid_now: '500.00', cash_account_id: 'box-1', ...over });
      const server = (globalThis.__amountServer = fakeServer(row()));
      const result = await outcome(m.setReceiptAmounts('d', before, { discount: 200_000n, paidNow: 50_000n, cashAccountId: 'box-1' }));
      const [patch] = server.requests;
      t.same(
        [result, patch?.body, ['discount=eq.1000.00', 'paid_now=eq.500.00', 'cash_account_id=eq.box-1'].every((x) => patch?.query.includes(x)), server.row.discount],
        ['ok', { discount: '2000.00' }, true, '2000.00'],
        'A5: الخصم وحده بالحمولة، ومشروط بالصفّ كما انقرا',
      );
      const raced = (globalThis.__amountServer = fakeServer(row({ paid_now: '700.00' })));
      t.same([await outcome(m.setReceiptAmounts('d', before, { discount: 200_000n, paidNow: 50_000n, cashAccountId: 'box-1' })), raced.row.discount], ['amount_changed', '1000.00'], 'A5: مدفوع غيّره كاتب ثاني ← amount_changed بلا كتابة');
      const noBox = (globalThis.__amountServer = fakeServer(row({ paid_now: '0.00', cash_account_id: null })));
      await m.setReceiptAmounts('d', { ...before, paidNow: 0n, cashAccountId: null }, { discount: 100_000n, paidNow: 30_000n, cashAccountId: 'box-1' });
      t.same([noBox.requests[0]?.query.includes('cash_account_id=is.null'), noBox.requests[0]?.body], [true, { paid_now: '300.00', cash_account_id: 'box-1' }], 'A5: صندوق فارغ شرطه is.null');
    }

    // A6: تحميل أُضيف وضاع جوابه: الإعادة بآخر قيم النموذج تعديل بمعرّفه.
    {
      const server = (globalThis.__amountServer = fakeServer({ id: 'c-1', label: 'نقل', amount: '650.00', allocate_by: 'mass', payee_party_id: 'p-1', cash_account_id: null }));
      await m.updateCharge('c-1', { label: ' نقل وتحميل ', amount: 70_000n, allocateBy: 'value', payeePartyId: 'p-1', cashAccountId: null });
      t.same([server.row.label, server.row.amount, server.row.allocate_by, server.requests[0]?.query.includes('id=eq.c-1')], ['نقل وتحميل', '700.00', 'value', true], 'A6: آخر قيم النموذج بمعرّف التحميل');
    }
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete globalThis.navigator;
  }
}
