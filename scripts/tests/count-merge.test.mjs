// الجمع والسبب بـrepo الجرد الحقيقي (المراجعة الثالثة لـWP5): updateCountLine وsetCountReason وaddCountLine من counts.ts كما هي
// (written وsend وauthed وpostgrest-js)، والعميل postgrest-js الحقيقي على خادم مزيّف بالذاكرة يطبّق شروط eq/is على صفّ واحد؛ ومحفوظ
// الجهاز (writeOrKeep وsendPending) الحقيقي على مخزن بالذاكرة. كل حالة كانت تفشل على الشفرة قبل إصلاحها:
// M1 الجمع المشروط بالرابط نفسه (counted_qty وcounted_expired_qty)؛ M2 الجمع وصل وجوابه ضاع ← مجموعه أساس جائز، و«أرسل المحفوظ»
// يكمل منه = انكتب (كان صفر صفوف = «لم يُقبل» والعادّ يضيف عدّه مرّتين)؛ M3 السطر تغيّر بجهاز ثاني ← رفض أكيد بلا كتابة؛ M4 الرفّ
// الثاني على جمع ضاع جوابه ووصل يكمل منه (كان «انرفض» فيُضاف مرّتين)؛ M6 جهاز ثاني وصل نفس المجموع ← رفض (كان التأكيد بالقيمة يقرا
// «انكتب» فيضيع العدّ)؛ M7 إدراج وصل وجوابه ضاع وجمع عليه جهاز ثاني ← رفض مو تعديل مطلق يمسح جمعه؛ M8 التعديل مشروط بالبطاقة؛ M5
// الجمع ما يكتب تواريخ ما كتبها العادّ؛ R1 السبب ويّا الفرقين اللي شافهم المدير، والسبب الفارغ بلا ختم؛ G1 (مراجعة WP8) كلفة وحدة
// الزيادة مشروطة باللي شافته الشاشة: غيّرها غيرك ← cost_changed بلا كتابة، ومحاولتك السابقة وصلت ← انكتب، والفارغة شرطها is.null.
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
        "export { updateCountLine, addCountLine, setCountReason, setGainUnitCost } from './src/lib/repo/counts.ts';",
        "export { writeOrKeep, sendPending } from './src/pages/inventory/countDevice.ts';",
        "export { NetworkError } from './src/lib/errors.ts';",
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
      if (init.method === 'POST') {
        if (server.row && server.row.id === body.id) {
          return new Response(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "stock_count_lines_pkey"', details: null, hint: null }), { status: 409, headers: { 'content-type': 'application/json' } });
        }
        server.row = { line_no: 1, reason: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null, ...body };
        if (server.loseNextAnswer) {
          server.loseNextAnswer = false;
          throw new TypeError('Failed to fetch');
        }
        return json(out());
      }
      if (init.method !== 'PATCH') throw new Error(`طلب غير متوقّع ${init.method}`);
      let match = true;
      for (const [key, value] of u.searchParams) {
        if (key === 'select') continue;
        const [op, ...rest] = value.split('.');
        const arg = rest.join('.');
        const have = server.row[key];
        if (op === 'eq') match &&= key === 'id' || key === 'line_id' ? have === arg : have !== null && Number(have) === Number(arg);
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

    // G1 (مراجعة WP8): كلفة وحدة الزيادة مشروطة بالكلفة اللي شافتها الشاشة (كانت تكتب بالسطر بس فتدوس مديراً ثانياً).
    {
      const other = (globalThis.__countServer = fakeServer({ line_id: 'L', gain_unit_cost: '1.2500' }));
      const lost = await m.setGainUnitCost('L', 10_000n, 15_000n).then(() => 'ok', (error) => error.code ?? error.name);
      const mine = (globalThis.__countServer = fakeServer({ line_id: 'L', gain_unit_cost: '1.5000' }));
      const landed = await m.setGainUnitCost('L', 10_000n, 15_000n).then(() => 'ok', (error) => error.code ?? error.name);
      const empty = (globalThis.__countServer = fakeServer({ line_id: 'L', gain_unit_cost: null }));
      const first = await m.setGainUnitCost('L', null, 12_500n).then(() => 'ok', (error) => error.code ?? error.name);
      t.same(
        [lost, other.row.gain_unit_cost, other.requests[0]?.query.includes('gain_unit_cost=eq.1.0000'), landed, mine.row.gain_unit_cost, first, empty.row.gain_unit_cost, empty.requests[0]?.query.includes('gain_unit_cost=is.null')],
        ['cost_changed', '1.2500', true, 'ok', '1.5000', 'ok', '1.2500', true],
        'G1: الكلفة مشروطة بـ1.0000 اللي شافتها الشاشة: غيرك كتب 1.2500 ← cost_changed وتبقى، ومحاولتك السابقة وصلت ← انكتب، والفارغة is.null',
      );
    }

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
      await m.updateCountLine('L', { counted_qty: '45.000' }, [{ counted_qty: '40.000', counted_expired_qty: null }]);
      t.ok(noExpiry.requests[0].query.includes('counted_expired_qty=is.null'), `M1: المنتهي الفارغ شرطه is.null: ${noExpiry.requests[0].query}`);
    }

    // M2: الجمع وصل وجوابه ضاع ← محفوظ؛ «أرسل المحفوظ» يعيده بنفس الشرط فصفر صفوف، والقراءة تلقى السطر بالمجموع = انكتب.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow()));
      const store = memoryStore();
      server.loseNextAnswer = true;
      const first = await m.writeOrKeep('d', store, merge(fields('40.000', '2.000'), fields('5.000', '1.000')), send);
      const keptBefore = store.box.lines.map((l) => [l.id, l.fields.counted_qty, l.bases.map((b) => b.counted_qty), l.added?.counted_qty]);
      const sent = await m.sendPending('d', store, send);
      t.same(
        [first.kind, keptBefore, sent.sent, sent.rejected.length, sent.failure, store.box.lines.length, server.row.counted_qty, server.requests.map((r) => r.method)],
        ['kept', [['L', '45.000', ['40.000', '45.000'], '5.000']], 1, 0, null, 0, '45.000', ['PATCH', 'PATCH', 'PATCH']],
        'M2: الجمع وصل وجوابه ضاع: محفوظ (45 من 40، أُضيف 5) ومجموعه أساس جائز؛ الإرسال بشرط 40 صفر صفوف ثم بشرط 45 يكتب، والخادم 45 مرّة وحدة',
      );
    }

    // M3: السطر تغيّر بجهاز ثاني (47) بعد ما انقرت الشاشة: رفض أكيد (صفر صفوف) بلا كتابة.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow({ counted_qty: '47.000' })));
      const result = await errorName(m.updateCountLine('L', { counted_qty: '45.000', counted_expired_qty: '3.000' }, [{ counted_qty: '40.000', counted_expired_qty: '2.000' }]));
      t.same([result, server.row.counted_qty, server.requests.map((r) => r.method)], ['ZeroRowsError', '47.000', ['PATCH']], 'M3: السطر صار 47 بجهاز ثاني: صفر صفوف بالشرط الوحيد ← رفض أكيد بلا كتابة والسطر 47');
    }

    // M4: الرفّ الثاني (+3) على جمع (+5) وصل وجوابه ضاع: المجموع 48 من أيّ أساس جائز (40، أو 45 اللي وصل)، مو «انرفض» فيُضاف مرّتين.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow()));
      const store = memoryStore();
      server.loseNextAnswer = true;
      await m.writeOrKeep('d', store, merge(fields('40.000', '2.000'), fields('5.000', '1.000')), send);
      const keptTotal = store.box.lines[0].fields;
      const second = await m.writeOrKeep('d', store, { kind: 'add', itemName: 'لقاح', baseUnit: 'pc', added: fields('3.000', '0.000'), base: { kind: 'kept', id: 'L', fields: keptTotal } }, send);
      t.same(
        [second.kind, server.row.counted_qty, server.row.counted_expired_qty, store.box.lines.length],
        ['written', '48.000', '3.000', 0],
        'M4: الرفّ الثاني على جمع وصل وجوابه ضاع: السطر 48 (40 + 5 + 3) والمنتهي 3، والمحفوظ فرغ',
      );
    }

    // M6: جهاز ثاني جمع (+5) أوّلاً فصار السطر 45، وهذا الجهاز يجمع +5 على 40 اللي شافه: رفض أكيد (العدّ يُضاف من جديد)، مو «انكتب».
    {
      const server = (globalThis.__countServer = fakeServer(lineRow({ counted_qty: '45.000', counted_expired_qty: '3.000' })));
      const result = await errorName(m.writeOrKeep('d', memoryStore(), merge(fields('40.000', '2.000'), fields('5.000', '1.000')), send));
      t.same([result, server.row.counted_qty], ['ZeroRowsError', '45.000'], 'M6: جهاز ثاني وصل نفس المجموع (45): الجمع من 40 ينرفض بلا «انكتب» كاذب، والسطر 45');
    }

    // M7: إدراج 5 وصل وجوابه ضاع (محفوظ ومجموعه أساس)، وجهاز ثاني جمع +3 (8)، والإرسال: 23505 ثم تعديل بشرط 5 ← رفض، مو 5 فوق الـ8.
    {
      const server = (globalThis.__countServer = fakeServer(null));
      const store = memoryStore();
      server.loseNextAnswer = true;
      const first = await m.writeOrKeep('d', store, { kind: 'add', itemName: 'لقاح', baseUnit: 'pc', added: fields('5.000', '0.000'), base: { kind: 'none', id: 'n1' } }, send);
      server.row.counted_qty = '8.000';
      const sent = await m.sendPending('d', store, send);
      t.same(
        [first.kind, sent.rejected.map((r) => r.error.name), server.row.counted_qty, store.box.lines.length],
        ['kept', ['ZeroRowsError'], '8.000', 0],
        'M7: إدراج وصل وجوابه ضاع وجمع عليه جهاز ثاني: الإرسال ينرفض (ينعرض بكميته) والسطر يبقى 8، مو 5 فوق جمعه',
      );
    }

    // M7b: إدراج 5 وصل وجوابه ضاع، ورفّ ثاني +2 بلا اتّصال على المحفوظ (7)، والإرسال: 23505 ثم تعديل بشرط المحاولة اللي وصلت (5) ← 7.
    {
      const server = (globalThis.__countServer = fakeServer(null));
      const store = memoryStore();
      server.loseNextAnswer = true;
      await m.writeOrKeep('d', store, { kind: 'add', itemName: 'لقاح', baseUnit: 'pc', added: fields('5.000', '0.000'), base: { kind: 'none', id: 'n2' } }, send);
      const keptFields = store.box.lines[0].fields;
      const offline = { add: async () => { throw new m.NetworkError(); }, update: async () => { throw new m.NetworkError(); } };
      await m.writeOrKeep('d', store, { kind: 'add', itemName: 'لقاح', baseUnit: 'pc', added: fields('2.000', '0.000'), base: { kind: 'kept', id: 'n2', fields: keptFields } }, offline);
      const keptNow = store.box.lines.map((l) => [l.fields.counted_qty, l.bases.map((b) => b.counted_qty)]);
      const sent = await m.sendPending('d', store, send);
      t.same([keptNow, sent.sent, sent.rejected.length, server.row.counted_qty], [[['7.000', ['5.000']]], 1, 0, '7.000'], 'M7b: إدراج وصل وجوابه ضاع ثم رفّ ثاني بلا اتّصال: المحفوظ 7 وأساسه 5، والإرسال يكمل من 5 ← 7');
    }

    // M8: التعديل (40 ← 50) مشروط بقيمة البطاقة: جهاز ثاني جمع +5 (45) فالتعديل ينرفض بلا ما يمسح جمعه.
    {
      const server = (globalThis.__countServer = fakeServer(lineRow({ counted_qty: '45.000', counted_expired_qty: '3.000' })));
      const set = { kind: 'set', line: { id: 'L', existing: true, itemName: 'لقاح', baseUnit: 'pc', fields: fields('50.000', '2.000') }, seen: { counted_qty: '40.000', counted_expired_qty: '2.000' } };
      const result = await errorName(m.writeOrKeep('d', memoryStore(), set, send));
      t.same([result, server.row.counted_qty], ['ZeroRowsError', '45.000'], 'M8: التعديل من 40 والسطر صار 45 بجهاز ثاني: رفض بلا كتابة');
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
