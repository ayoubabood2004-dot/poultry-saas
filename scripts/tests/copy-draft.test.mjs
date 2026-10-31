// نسخة للتصحيح بـrepo المخزون الحقيقي (0011، قرار المالك 2026-10-31): copyDocToDraft من inventory.ts كما هي (call وsend وauthed
// وpostgrest-js)، وrunCopy من stock-shared.tsx كما هي، على خادم PostgREST مزيّف بالذاكرة يطبّق عقد copy_doc_to_draft: المرجع (ref_claim:
// نفس المرجع ونفس المعاملات = نفس الجواب، وبمعاملات ثانية ref_reused)، والمعرّف الجديد (نفس المعرّف لنفس الأصل = نفس الجواب، ولغيره
// id_reused)، و«الجواب يضيع» بعد ما يطبّق. P1 المعاملات الأربع بأسمائها والجواب مقروء (ورمزا المال من money، المراجعة R-DB-3)؛ P2 جواب
// ضاع ← الإعادة بنفس المرجع والمعرّف ترجّع نفس الورقة (ورقة وحدة بالخادم)، والنسخة بعد النجاح زوج جديد؛ P3 رفض أكيد (not_void) بتلميحه،
// والمحاولة بعده زوج جديد؛ P4 جواب مخفي لغير الكلفة (amounts، بلا money) ينقرا، ورموز money تنضمّ بترتيب العقد؛ P5 جواب بشكل غلط يرمي
// بدل ما ينقبل.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://fake.local/rest/v1', { fetch: (...a) => globalThis.__copyServer.fetch(...a) });
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
    stdin: {
      contents: [
        "export { copyDocToDraft, newStockRef } from './src/lib/repo/inventory.ts';",
        "export { runCopy } from './src/pages/inventory/stock-shared.tsx';",
        "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
      ].join('\n'),
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
    plugins: [
      {
        name: 'copy-client',
        setup(b) {
          b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'copy-client' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'copy-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const refused = (code, hint) => json({ code: 'P0001', message: code, details: null, hint }, 400);

/**
 * خادم copy_doc_to_draft مزيّف: المصدر ملغى أو لا، والمرجع والمعرّف الجديد كما بالعقد (§3 البنود 3 و8)، وكل ورقة جديدة تنحسب مرّة.
 * answer(kind, id, newId) يبني الجواب (لغير الكلفة: بلا مبالغ، amounts بالمتروك).
 */
function fakeServer({ voided = true, answer }) {
  const server = {
    requests: [],
    refs: new Map(),
    created: new Map(),
    loseNextAnswer: false,
    async fetch(url, init) {
      const u = new URL(String(url));
      const body = init.body ? JSON.parse(init.body) : null;
      server.requests.push({ method: init.method, path: u.pathname, body });
      if (init.method !== 'POST' || u.pathname !== '/rest/v1/rpc/copy_doc_to_draft') throw new Error(`طلب غير متوقّع ${init.method} ${u.pathname}`);
      const { p_doc_kind: kind, p_id: id, p_new_id: newId, p_client_ref: ref } = body;
      const args = JSON.stringify([kind, id, newId]);
      const kept = server.refs.get(ref);
      if (kept) return kept.args === args ? json(kept.result) : refused('ref_reused', 'مرجع هذه العملية استُعمل لعملية أخرى. حدّث الشاشة وأعد العملية من جديد.');
      if (!voided) return refused('not_void', 'هذا المستند غير ملغى؛ تُفتح نسخة للتصحيح من مستند ملغى فقط.');
      const made = server.created.get(newId);
      if (made && made.source !== `${kind}:${id}`) return refused('id_reused', 'معرّف الورقة الجديدة مستعمل لمستند آخر. حدّث الشاشة وأعد المحاولة.');
      const result = made ? made.result : answer(kind, id, newId);
      if (!made) server.created.set(newId, { source: `${kind}:${id}`, result });
      server.refs.set(ref, { args, result });
      if (server.loseNextAnswer) {
        server.loseNextAnswer = false;
        throw new TypeError('Failed to fetch');
      }
      return json(result);
    },
  };
  return server;
}

// جواب أدوار الكلفة بشكل 0011 بعد المراجعة R-DB-3: رمزا المال داخل money، والباقي بـskipped.
const costAnswer = (kind, id, newId) => ({ id: newId, doc_kind: kind, source_id: id, status: 'draft', version: 1, lines: 2, skipped: [], money: { skipped: ['paid_now', 'box_charge'] } });

export default async function (t) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  try {
    const m = await bundle();
    const outcome = (promise) => promise.then((value) => value, (error) => ({ error: error.code ?? error.name, hint: error.hint ?? null }));

    // P1: نداء واحد بالمعاملات الأربع بأسمائها، والجواب مقروء (المعرّف والنوع وعدد السطور والمتروك بترتيبه).
    {
      const server = (globalThis.__copyServer = fakeServer({ answer: costAnswer }));
      const ref = m.newStockRef();
      const got = await m.copyDocToDraft(ref, 'receipt', 'pu-1', 'new-1');
      const [request] = server.requests;
      t.same(
        [request?.path, request?.body, got],
        ['/rest/v1/rpc/copy_doc_to_draft', { p_doc_kind: 'receipt', p_id: 'pu-1', p_new_id: 'new-1', p_client_ref: ref.clientRef }, { id: 'new-1', kind: 'receipt', lines: 2, skipped: ['paid_now', 'box_charge'] }],
        'P1: copy_doc_to_draft بالنوع والأصل والمعرّف الجديد والمرجع، والجواب: الورقة new-1 بسطرين وما لم يُنسخ (المدفوع وتحميل الصندوق)',
      );
    }

    // P2: الجواب ضاع بعد ما انكتبت الورقة: الإعادة بنفس المرجع ونفس المعرّف ترجّع نفس الورقة، وبالخادم ورقة وحدة؛ والنسخة بعد النجاح زوج جديد.
    {
      const server = (globalThis.__copyServer = fakeServer({ answer: costAnswer }));
      server.loseNextAnswer = true;
      const first = await m.runCopy('transfer', 'tr-1');
      const second = await m.runCopy('transfer', 'tr-1');
      const afterRetry = server.created.size;
      const third = await m.runCopy('transfer', 'tr-1');
      const [a, b, c] = server.requests.map((r) => r.body);
      t.same(
        [first.kind, first.error?.name, second.kind, second.result?.id === a?.p_new_id, b?.p_new_id === a?.p_new_id, b?.p_client_ref === a?.p_client_ref, afterRetry],
        ['failed', 'UnknownOutcomeError', 'done', true, true, true, 1],
        'P2: «ما نعرف شنو صار» ثم الإعادة بنفس المرجع والمعرّف: نفس الورقة، وورقة وحدة بالخادم',
      );
      t.same([third.kind, c?.p_new_id !== a?.p_new_id, c?.p_client_ref !== a?.p_client_ref, server.created.size], ['done', true, true, 2], 'P2: نسخة ثانية بعد النجاح زوج جديد (ورقة ثانية، مو الأولى اللي ممكن انحذفت)');
    }

    // P2b: نفس المعرّف بمرجع جديد (العقد §3 البند 8: إعادة الجهاز بمرجع ضاع) ترجّع نفس الورقة؛ ونفس المعرّف لأصل ثاني id_reused.
    {
      const server = (globalThis.__copyServer = fakeServer({ answer: costAnswer }));
      const one = await m.copyDocToDraft(m.newStockRef(), 'count', 'ct-1', 'new-9');
      const again = await m.copyDocToDraft(m.newStockRef(), 'count', 'ct-1', 'new-9');
      const other = await outcome(m.copyDocToDraft(m.newStockRef(), 'count', 'ct-2', 'new-9'));
      t.same([one.id, again.id, server.created.size, other.error], ['new-9', 'new-9', 1, 'id_reused'], 'P2b: نفس المعرّف لنفس الأصل نفس الورقة، ولأصل ثاني id_reused');
    }

    // P3: رفض أكيد (المصدر غير ملغى) بتلميحه الفصيح؛ والمحاولة بعده زوج جديد (الرفض ينسى المرجع والمعرّف).
    {
      const server = (globalThis.__copyServer = fakeServer({ voided: false, answer: costAnswer }));
      const first = await m.runCopy('stock_use', 'su-1');
      const second = await m.runCopy('stock_use', 'su-1');
      const [a, b] = server.requests.map((r) => r.body);
      t.same(
        [first.kind, first.error?.code, first.error?.hint, second.error?.code, b?.p_new_id !== a?.p_new_id, b?.p_client_ref !== a?.p_client_ref],
        ['failed', 'not_void', 'هذا المستند غير ملغى؛ تُفتح نسخة للتصحيح من مستند ملغى فقط.', 'not_void', true, true],
        'P3: not_void بتلميحه، والمحاولة الثانية بمرجع ومعرّف جديدين',
      );
    }

    // P4: الجواب المخفي لغير الكلفة (الأمين): amounts بالمتروك وبلا money؛ ورموز money بجواب الكلفة تنضمّ للمتروك بترتيب العقد (amounts
    // وpaid_now وbox_charge وapproval وunit_changed)، والرمز اللي ما تعرفه الشاشة بعدها بترتيب وصوله.
    {
      globalThis.__copyServer = fakeServer({ answer: (kind, id, newId) => ({ id: newId, doc_kind: kind, source_id: id, status: 'draft', version: 1, lines: 1, skipped: ['amounts', 'unit_changed'] }) });
      const masked = await m.copyDocToDraft(m.newStockRef(), 'supplier_return', 'rt-1', 'new-2');
      globalThis.__copyServer = fakeServer({ answer: (kind, id, newId) => ({ id: newId, doc_kind: kind, source_id: id, status: 'draft', version: 1, lines: 1, skipped: ['later_code', 'unit_changed', 'approval'], money: { skipped: ['box_charge'] } }) });
      const withMoney = await m.copyDocToDraft(m.newStockRef(), 'receipt', 'pu-2', 'new-3');
      t.same(
        [masked, withMoney],
        [{ id: 'new-2', kind: 'supplier_return', lines: 1, skipped: ['amounts', 'unit_changed'] }, { id: 'new-3', kind: 'receipt', lines: 1, skipped: ['box_charge', 'approval', 'unit_changed', 'later_code'] }],
        'P4: جواب الأمين بلا مال ينقرا، ورمز money (box_charge) ينضمّ للمتروك بترتيب العقد والرمز الغريب آخراً',
      );
    }

    // P5: جواب بشكل غلط يرمي بدل ما ينقبل: بلا skipped، ونوع ورقة مو من الستّة، ورمز متروك فارغ.
    {
      const shapes = [
        (kind, id, newId) => ({ id: newId, doc_kind: kind, lines: 1 }),
        (kind, id, newId) => ({ id: newId, doc_kind: 'production', lines: 1, skipped: [] }),
        (kind, id, newId) => ({ id: newId, doc_kind: kind, lines: 1, skipped: [''] }),
        (kind, id, newId) => ({ id: newId, doc_kind: kind, lines: 1, skipped: [], money: { skipped: 'paid_now' } }),
        (kind, id, newId) => ({ id: newId, doc_kind: kind, lines: 1, skipped: [], money: { discount: '5000.00' } }),
      ];
      const seen = [];
      for (const answer of shapes) {
        globalThis.__copyServer = fakeServer({ answer });
        seen.push((await outcome(m.copyDocToDraft(m.newStockRef(), 'opening', 'op-1', 'new-4'))).error);
      }
      t.same(seen, ['RowShapeError', 'RowShapeError', 'RowShapeError', 'RowShapeError', 'RowShapeError'], 'P5: skipped ناقص، ونوع غريب، ورمز فارغ، وmoney.skipped مو قائمة أو ناقص: كلها RowShapeError');
    }
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete globalThis.navigator;
    delete globalThis.__copyServer;
  }
}
