// الجمع والسبب بـrepo الجرد الحقيقي (المراجعة الثالثة لـWP5): updateCountLine وsetCountReason وaddCountLine من counts.ts كما هي
// (written وsend وauthed وpostgrest-js)، والعميل postgrest-js الحقيقي على خادم مزيّف بالذاكرة يطبّق شروط eq/is على صفّ واحد؛ ومحفوظ
// الجهاز (writeOrKeep وsendPending) الحقيقي على مخزن بالذاكرة. كل حالة كانت تفشل على الشفرة قبل إصلاحها:
// M1 الجمع المشروط بالرابط نفسه (counted_qty وcounted_expired_qty)؛ M2 الجمع وصل وجوابه ضاع ← «أرسل المحفوظ» يقرا السطر بالمجموع = انكتب
// (كان صفر صفوف = «لم يُقبل» والعادّ يضيف عدّه مرّتين)؛ M3 السطر تغيّر بجهاز ثاني ← رفض أكيد بلا كتابة؛ M4 قراءة التأكيد بلا شبكة ←
// يبقى محفوظاً (غير أكيد)؛ M5 الجمع ما يكتب تواريخ ما كتبها العادّ (كان يرجّع تاريخاً عدّله جهاز ثاني)؛ R1 السبب ويّا الفرقين
// اللي شافهم المدير، والسبب الفارغ بلا ختم.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://fake.local/rest/v1', { fetch: (...a) => globalThis.__countServer.fetch(...a) });
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
        "export { updateCountLine, addCountLine, setCountReason } from './src/lib/repo/counts.ts';",
        "export { writeOrKeep, sendPending } from './src/pages/inventory/countDevice.ts';",
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
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins: [
      {
        name: 'count-client',
        setup(b) {
          b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'count-client' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'count-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/** خادم PostgREST مزيّف لصفّ سطر جرد واحد: PATCH بشروط eq/is، وGET بالمعرّف، و«الجواب يضيع» بعد ما يطبّق. */
function fakeServer(row) {
  const server = {
    row,
    requests: [],
    loseNextAnswer: false,
    failReads: false,
    async fetch(url, init) {
      const u = new URL(String(url));
      const body = init.body ? JSON.parse(init.body) : null;
      server.requests.push({ method: init.method, query: decodeURIComponent(u.search), body });
      const out = () => [{ ...server.row, item: { name: 'لقاح', kind: 'vaccine', base_unit: 'pc', tracks_expiry: true } }];
      const json = (rows) => new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
      if (init.method === 'GET') {
        if (server.failReads) throw new TypeError('Failed to fetch');
        return json(out());
      }
      if (init.method !== 'PATCH') throw new Error(`طلب غير متوقّع ${init.method}`);
      let match = true;
      for (const [key, value] of u.searchParams) {
        if (key === 'select') continue;
        const [op, ...rest] = value.split('.');
        const arg = rest.join('.');
        const have = server.row[key];
        if (op === 'eq') match &&= key === 'id' ? have === arg : have !== null && Number(have) === Number(arg);
        else if (op === 'is') match &&= arg === 'null' && have === null;
        else throw new Error(`شرط غير معروف ${op}`);
      }
      if (match) Object.assign(server.row, body);
      if (server.loseNextAnswer) {
        server.loseNextAnswer = false;
        throw new TypeError('Failed to fetch');
      }
      return json(match ? out() : []);
    },
  };
  return server;
}

const lineRow = (over = {}) => ({ id: 'L', line_no: 1, item_id: 'v', counted_qty: '40.000', counted_expired_qty: '2.000', gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null, reason: null, ...over });
const fields = (counted, expired, over = {}) => ({ item_id: 'v', counted_qty: counted, counted_expired_qty: expired, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null, ...over });
const memoryStore = () => {
  const box = { lines: [] };
  return { box, read: async () => (box.lines.length ? { payload: { docId: 'd', lines: box.lines } } : null), write: async (lines) => void (box.lines = [...lines]) };
};

export default async function (t) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  try {
    const m = await bundle();
    const send = { add: m.addCountLine, update: m.updateCountLine };
    const merge = (base, added) => ({ kind: 'add', itemName: 'لقاح', baseUnit: 'pc', added, base: { kind: 'server', id: 'L', fields: base } });
    const errorName = (promise) => promise.then(() => 'ok', (error) => error.name);

    // M1: الجمع (40 + 5، والمنتهي 2 + 1) تعديل مشروط بالعدّ اللي انحسب منه، بالرابط نفسه.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow()));
      const outcome = await m.writeOrKeep('d', memoryStore(), merge(fields('40.000', '2.000'), fields('5.000', '1.000')), send);
      t.same(
        [outcome.kind, server.requests.map((r) => [r.method, r.query.includes('counted_qty=eq.40.000'), r.query.includes('counted_expired_qty=eq.2.000')])],
        ['written', [['PATCH', true, true]]],
        'M1: الجمع تعديل واحد بشرط counted_qty=eq.40.000 وcounted_expired_qty=eq.2.000',
      );
      t.same([server.row.counted_qty, server.row.counted_expired_qty], ['45.000', '3.000'], 'M1: السطر صار 45 والمنتهي 3');
      const noExpiry = (globalThis.__countServer = fakeServer(lineRow({ counted_expired_qty: null })));
      await m.updateCountLine('L', { counted_qty: '45.000' }, { counted_qty: '40.000', counted_expired_qty: null });
      t.ok(noExpiry.requests[0].query.includes('counted_expired_qty=is.null'), `M1: المنتهي الفارغ شرطه is.null: ${noExpiry.requests[0].query}`);
    }

    // M2: الجمع وصل وجوابه ضاع ← محفوظ؛ «أرسل المحفوظ» يعيده بنفس الشرط فصفر صفوف، والقراءة تلقى السطر بالمجموع = انكتب.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow()));
      const store = memoryStore();
      server.loseNextAnswer = true;
      const first = await m.writeOrKeep('d', store, merge(fields('40.000', '2.000'), fields('5.000', '1.000')), send);
      const keptBefore = store.box.lines.map((l) => [l.id, l.fields.counted_qty, l.expected?.counted_qty, l.added?.counted_qty]);
      const sent = await m.sendPending('d', store, send);
      t.same(
        [first.kind, keptBefore, sent.sent, sent.rejected.length, sent.failure, store.box.lines.length, server.row.counted_qty],
        ['kept', [['L', '45.000', '40.000', '5.000']], 1, 0, null, 0, '45.000'],
        'M2: الجمع وصل وجوابه ضاع: محفوظ بالجهاز (45 من 40، أُضيف 5)، والإرسال يقرا السطر بالمجموع فـ«أُرسل» بلا رفض، والخادم 45 مرّة وحدة',
      );
    }

    // M3: السطر تغيّر بجهاز ثاني (47) بعد ما انقرت الشاشة: رفض أكيد (صفر صفوف) بلا كتابة.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow({ counted_qty: '47.000' })));
      const result = await errorName(m.updateCountLine('L', { counted_qty: '45.000', counted_expired_qty: '3.000' }, { counted_qty: '40.000', counted_expired_qty: '2.000' }));
      t.same([result, server.row.counted_qty, server.requests.map((r) => r.method)], ['ZeroRowsError', '47.000', ['PATCH', 'GET']], 'M3: السطر صار 47 بجهاز ثاني: صفر صفوف وقراءة ما تلقى المجموع ← رفض أكيد والسطر 47');
    }

    // M4: قراءة التأكيد بلا شبكة: الخطأ خطؤها (غير أكيد)، فالجمع يبقى محفوظاً مو «انرفض».
    {
      const server = (globalThis.__countServer = fakeServer(lineRow({ counted_qty: '47.000' })));
      server.failReads = true;
      const store = memoryStore();
      store.box.lines = [{ id: 'L', existing: true, itemName: 'لقاح', baseUnit: 'pc', fields: fields('45.000', '3.000'), expected: { counted_qty: '40.000', counted_expired_qty: '2.000' }, added: fields('5.000', '1.000') }];
      const sent = await m.sendPending('d', store, send);
      t.same([sent.rejected.length, sent.failure === null, store.box.lines.length], [0, false, 1], 'M4: قراءة التأكيد فشلت بالشبكة: لا رفض، والجمع باقٍ بالجهاز');
    }

    // M5: الجمع بلا تواريخ مكتوبة ما يرسل تواريخ (جهاز ثاني عدّل تاريخ الزيادة فقط وبقي)؛ والتاريخ المكتوب الآن ينرسل.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow({ gain_expiry_on: '2027-02-02' })));
      await m.writeOrKeep('d', memoryStore(), merge(fields('40.000', '2.000', { gain_expiry_on: '2027-01-01' }), fields('5.000', '1.000')), send);
      const plain = Object.keys(server.requests[0].body).sort();
      const dated = (globalThis.__countServer = fakeServer(lineRow()));
      await m.writeOrKeep('d', memoryStore(), merge(fields('40.000', '2.000'), fields('5.000', '1.000', { gain_expiry_on: '2027-03-03' })), send);
      t.same(
        [plain, server.row.gain_expiry_on, Object.keys(dated.requests[0].body).sort(), dated.row.gain_expiry_on],
        [['counted_expired_qty', 'counted_qty'], '2027-02-02', ['counted_expired_qty', 'counted_qty', 'gain_expiry_on'], '2027-03-03'],
        'M5: الجمع يكتب الكميات والتواريخ المكتوبة الآن بس: تاريخ عدّله جهاز ثاني يبقى، والمكتوب الآن ينكتب',
      );
    }

    // R1: السبب بالفرقين اللي شافهم المدير (الخادم يقارنهما بالفرق الحالي)، والسبب الفارغ يمسح الختم.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow()));
      await m.setCountReason('L', ' كسر ', { diff: -2000n, expiredDiff: 1000n });
      await m.setCountReason('L', '   ', { diff: -2000n, expiredDiff: null });
      t.same(
        server.requests.map((r) => r.body),
        [
          { reason: 'كسر', reason_diff: '-2.000', reason_expired_diff: '1.000' },
          { reason: null, reason_diff: null, reason_expired_diff: null },
        ],
        'R1: السبب ويّا الفرقين اللي بالشاشة (−2 و+1)، والفارغ بلا ختم',
      );
    }
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete globalThis.navigator;
    delete globalThis.__countServer;
  }
}
