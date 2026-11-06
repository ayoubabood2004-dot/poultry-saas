// دمج «المخزن ببساطة» (0017؛ العقد scratchpad/simple/contract.md §4، ودرس 2026-11-02: «فحص الدمج هو اللي يمسك فرق مفتاح أو مرتبة — جواب
// القاعدة الحقيقي يمرّ بمحلّل الشاشات الحقيقي محزوماً بـesbuild»). الطرفان بُنيا بوكيلين على عقد واحد، والشاشات ما لمست قاعدة حقيقية؛ فهنا:
// • repo الحقيقي (src/lib/repo/purchases.ts: recordPurchase وloadItemFile وloadItemsOverview ومحلّلاتها الثلاثة) محزوماً بـesbuild، وعميله
//   postgrest-js الحقيقي يبني الطلب كما في المتصفّح، وfetch يذهب إلى PostgREST مصغَّر (RPC وحده) فوق db.asUser: الدالّة تُعرف بأسماء
//   معاملاتها من الكتالوج (اسم لا تعرفه أو معامل ناقص = PGRST202 كما يردّ PostgREST)، والمعاملات تُقرأ من نصّ الطلب نفسه بـjson_to_record
//   كما يفعل PostgREST (فمراتب النصّ العشري «1000.000» تصل الدالّة كما أُرسلت، وهي ما تبصمه ref_claim).
// • الأدوار: المالك والمدير والمحاسب والأمين بنطاق وحدة المعمل (يسجّل ويرى المال، جواب المالك ٢) ومشغّل المعمل (يرى الكميات بلا مال)
//   وعامل القاعة (نطاقه وحدة اللحم: لا شيء من المواد).
// • المواد: كيلو (ذرة)، ولتر بكثافة (زيت 0.92)، وقطعة (أكياس تعبئة: تُستلم في مخزن المواد أو العامّ، فـstore_required للمدير)؛ بالدين
//   ونقداً؛ بسعر بيع وبلا؛ واستلامان قديمان من ورقة الاستلام (post_receipt، بلا صفّ purchase_prices) فسعر الوحدة مشتقّ = المبلغ ÷ الكمية؛
//   وشراء ملغى خارج الملفّ والبطاقات؛ والجواب المحفوظ (المرجع نفسه بعد جواب ضاع) يمرّ بالمحلّل؛ ونصّ الكمية بمراتب الإدخال (SQL بلا كسور)
//   ومراتب الشاشة (ثلاث) يُقرأ رقماً واحداً.
// • جسم الطلب: مفاتيحه = أسماء معاملات record_purchase بالكتالوج، والإعادة بعد نتيجة مجهولة ترسل النصّ نفسه بايتاً ببايت (ref_claim يبصم
//   المعاملات jsonb نصّاً: «1000» غير «1000.000» ← ref_reused، والضابط يثبت ذلك).
// الأرقام محسوبة باليد في التعليق جنب كلّ واحد، لا منسوخة من جواب الدالّة.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { postedReceipt, voidReceipt } from './receipt-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-11-06';
const GO_LIVE = '2026-10-20';
const id = (n) => `b1710000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099710${String(n).padStart(2, '0')}`;
const RP = 'select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as v';

// عميل Supabase للدمج: postgrest-js الحقيقي، وfetch إلى globalThis.__buyPg (miniRpc أدناه). اسم عامّ لهذا الملف وحده، ويُحذف بـfinally.
const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://pg.local/rest/v1', { fetch: (...a) => globalThis.__buyPg.fetch(...a) });
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: globalThis.__buyPg.user }, access_token: 'a' } }, error: null }),
      refreshSession: async () => ({ data: { session: {} }, error: null }),
    },
    from: (table) => rest.from(table),
    rpc: (fn, args) => rest.rpc(fn, args),
  };
}
export const STORED_SESSION = /^sb-.+-auth-token$/;
export function addAuthListener() { return () => {}; }
export async function dropClient() {}
`;

/** purchases.ts الحقيقي (المحلّلات والنداءات معاً، حزمة واحدة) وأصناف الأخطاء، وعميله يصل miniRpc. */
async function screensRepo() {
  const result = await build({
    stdin: {
      contents: [
        'export { parseItemsOverview, parseItemFile, parseRecordPurchase, recordPurchase, loadItemFile, loadItemsOverview, newPurchaseIds }',
        "  from './src/lib/repo/purchases.ts';",
        "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
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
        name: 'buy-client',
        setup(b) {
          b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'buy-client' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'buy-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/**
 * PostgREST مصغَّر للنداءات (POST /rpc/fn) فوق القاعدة الحقيقية بهويّة المستخدم (db.asUser، كما يفعل PostgREST بمطالبات JWT). الدالّة
 * تُختار بأسماء مفاتيح الجسم من pg_proc: مفتاح ليس معاملاً أو معامل إلزامي غائب = PGRST202 (404). والقيم تُقرأ من نصّ الجسم نفسه
 * بـjson_to_record بأنواع المعاملات (كما يبني PostgREST جملته)، لا من قيم JS: فـ"1000.000" تصل numeric بمراتبها. sent يحفظ نصّ كلّ جسم
 * كما أرسله postgrest-js، وreplies نصّ كلّ جواب؛ وlose يجعل النداء التالي ينفَّذ ويثبت ثمّ يرجع 504 (الجواب ضاع في الطريق).
 */
function miniRpc(db) {
  const signatures = new Map();
  const ident = (name) => {
    if (!/^[a-z_][a-z0-9_]*$/u.test(name)) throw Object.assign(new Error(`miniRpc: identifier «${name}»`), { code: 'PGRST100', status: 400 });
    return name;
  };
  async function rpc(fn, text) {
    if (!signatures.has(fn)) {
      const { rows } = await db.admin(
        `select coalesce(p.proargnames, '{}') as names, p.pronargs as n, p.pronargdefaults as d,
           array(select format_type(x.t, null) from unnest(p.proargtypes::oid[]) with ordinality as x(t, k) order by x.k) as types
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
        [ident(fn)],
      );
      signatures.set(fn, rows);
    }
    const args = JSON.parse(text);
    const keys = Object.keys(args);
    const match = signatures.get(fn).find((s) => keys.every((k) => s.names.includes(k)) && s.names.slice(0, s.n - s.d).every((k) => keys.includes(k)));
    if (!match) throw Object.assign(new Error(`Could not find the function public.${fn}(${keys.join(', ')}) in the schema cache`), { code: 'PGRST202', status: 404 });
    const typeOf = (k) => match.types[match.names.indexOf(k)];
    const sql = keys.length
      ? `select public.${fn}(${keys.map((k) => `${ident(k)} => a.${k}`).join(', ')}) as body from json_to_record($1::json) as a(${keys.map((k) => `${k} ${typeOf(k)}`).join(', ')})`
      : `select public.${fn}() as body`;
    return (await db.asUser(server.user, (q) => q(sql, keys.length ? [text] : []), { commit: true })).rows[0].body;
  }
  const server = {
    user: null,
    lose: false,
    sent: [],
    replies: [],
    async fetch(url, init = {}) {
      const route = new URL(String(url)).pathname.replace(/^\/rest\/v1\//u, '');
      const reply = (status, body) => {
        const text = body === undefined ? '' : JSON.stringify(body);
        server.replies.push({ status, text });
        return new Response(text || null, { status, headers: { 'content-type': 'application/json' } });
      };
      if (!route.startsWith('rpc/') || (init.method ?? 'GET') !== 'POST') return reply(400, { code: 'PGRST100', message: `miniRpc: ${init.method ?? 'GET'} ${route}` });
      const fn = route.slice('rpc/'.length);
      const text = typeof init.body === 'string' ? init.body : '{}';
      server.sent.push({ fn, body: text });
      try {
        const out = await rpc(fn, text);
        if (server.lose) {
          server.lose = false;
          return reply(504, undefined);
        }
        return reply(200, out);
      } catch (error) {
        const code = error.code ?? '';
        const status = error.status ?? (code === '42501' ? 403 : code === '23505' || code === '23503' ? 409 : 400);
        return reply(status, { code, message: error.message, details: error.detail ?? null, hint: error.hint ?? null });
      }
    },
  };
  return server;
}

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة دمج الشراء',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['storekeeper', 'storekeeper', ['feed_mill']],
      ['millOperator', 'mill_operator', ['feed_mill']],
      ['hallWorker', 'hall_worker', ['broiler']],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  for (const kind of Object.keys(D)) await one(U.owner, 'select public.set_division_go_live($1, $2)', [D[kind], GO_LIVE]);
  const stores = (await db.admin('select kind, id, name from public.warehouses where org_id = $1 and archived_at is null', [org])).rows;
  const W = Object.fromEntries(stores.map((r) => [r.kind, r.id]));
  const storeName = Object.fromEntries(stores.map((r) => [r.id, r.name]));
  t.same([stores.filter((r) => r.kind === 'raw').length, stores.filter((r) => r.kind === 'general').length], [1, 1], 'المنشأة بمخزن مواد أوّلية واحد ومخزن عامّ واحد (الأكياس تُستلم في الاثنين)');
  const item = (name, kind, unit, density = null) => one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l) values ($1, $2, $3, $4) returning id', [name, kind, unit, density]);
  const CORN = await item('ذرة الدمج', 'raw', 'kg');
  const OIL = await item('زيت الدمج', 'raw', 'L', '0.92');
  const BAGS = await item('أكياس الدمج', 'packaging', 'pc');
  const SUPPLIER = await one(U.accountant, "insert into public.parties (name, is_supplier) values ('محمد علي', true) returning id");
  const OTHER = await one(U.accountant, "insert into public.parties (name, is_supplier) values ('شركة الحبوب', true) returning id");
  const BOX = await one(U.accountant, "insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");

  const server = miniRpc(db);
  globalThis.__buyPg = server;
  const hadOnLine = Object.getOwnPropertyDescriptor(globalThis.navigator ?? {}, 'onLine');
  // الجهاز متّصل لحظة الإرسال (core.isOnline يقرأ navigator.onLine؛ وNode بلا قيمة له)، فالجواب الضائع «لم يُعرف» لا «لم يُرسل».
  if (globalThis.navigator) Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  try {
    const repo = await screensRepo();
    const actAs = (user) => {
      server.user = user;
    };
    const outcome = async (promise) => {
      try {
        return { ok: true, value: await promise };
      } catch (error) {
        return { ok: false, code: error instanceof repo.RejectedError ? error.code : error.name, hint: error.hint ?? null, error };
      }
    };
    const lastSent = (fn) => server.sent.filter((s) => s.fn === fn).at(-1);
    const lastReply = () => JSON.parse(server.replies.at(-1).text);
    const ids = () => repo.newPurchaseIds();
    // expiryOn وbornAt (مراجعة 0017 الأولى M3): null للمواد التي لا تتابع الانتهاء ولغير الأفراخ، ومفتاحاهما في الجسم دائماً.
    const base = { partyId: SUPPLIER, receivedOn: TODAY, sellPrice: null, payment: 'credit', cashAccountId: null, warehouseId: null, expiryOn: null, bornAt: null };

    // ─── ١) جسم الطلب = توقيع الدالّة ────────────────────────────────────────────────────────────────────────────
    // P1 (الأمين، بالدين): 1,000 كغم ذرة × 450 = 450,000 دينار، وسعر البيع 500. Milli 1,000,000 وFils 45,000 و50,000.
    actAs(U.storekeeper);
    const p1Ids = ids();
    const p1 = await outcome(repo.recordPurchase(p1Ids, { ...base, itemId: CORN, qty: 1000000n, unitPrice: 45000n, sellPrice: 50000n }));
    t.ok(p1.ok, `الأمين يسجّل شراء الذرة من الشاشة بـrepo الحقيقي (${p1.code ?? ''} ${p1.hint ?? ''})`);
    const p1Raw = lastReply();
    const sig = (await db.admin("select p.proargnames as names, array(select format_type(x, null) from unnest(p.proargtypes::oid[]) as x) as types from pg_proc p where p.oid = 'public.record_purchase(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, text, uuid, uuid, date, timestamptz)'::regprocedure")).rows[0];
    const body1 = JSON.parse(lastSent('record_purchase').body);
    t.same(Object.keys(body1).sort(), [...sig.names].sort(), 'جسم recordPurchase: مفاتيحه الأربعة عشر = أسماء معاملات record_purchase بالكتالوج بالضبط (لا زائد ولا ناقص؛ والتاريخان من مراجعة 0017 الأولى M3)');
    t.same(
      sig.names.map((name) => [name, sig.types[sig.names.indexOf(name)], body1[name] === null ? 'null' : typeof body1[name]]),
      [
        ['p_client_ref', 'uuid', 'string'], ['p_receipt_id', 'uuid', 'string'], ['p_line_id', 'uuid', 'string'], ['p_item', 'uuid', 'string'], ['p_party', 'uuid', 'string'],
        ['p_received_on', 'date', 'string'], ['p_qty', 'numeric', 'string'], ['p_unit_price', 'numeric', 'string'], ['p_sell_price', 'numeric', 'string'],
        ['p_payment', 'text', 'string'], ['p_cash_account', 'uuid', 'null'], ['p_warehouse', 'uuid', 'null'],
        ['p_expiry_on', 'date', 'null'], ['p_born_at', 'timestamp with time zone', 'null'],
      ],
      'جسم recordPurchase: كلّ معامل بنوعه بالكتالوج، والأعداد نصوص عشرية لا أعداد JS (E3)، والصندوق والمخزن null للدين والمخزن الذي يختاره الخادم، والتاريخان null لذرة لا تتابع الانتهاء',
    );
    t.same(
      [body1.p_client_ref, body1.p_receipt_id, body1.p_line_id, body1.p_item, body1.p_party, body1.p_received_on, body1.p_qty, body1.p_unit_price, body1.p_sell_price, body1.p_payment],
      [p1Ids.clientRef, p1Ids.receiptId, p1Ids.lineId, CORN, SUPPLIER, TODAY, '1000.000', '450.00', '500.00', 'credit'],
      'جسم recordPurchase: المعرّفات المولَّدة مرّة للنموذج، والكمية بثلاث مراتب (Milli) والسعران بمرتبتين (Fils) نصّاً ثابتاً',
    );
    // ضابط الفحص: مفتاح بغير اسمه (p_quantity) أو معامل غائب يرجع PGRST202 من miniRpc، فتطابق الأسماء أعلاه ليس تطابقاً مع نفسه.
    const renamed = Object.fromEntries(Object.entries(body1).map(([k, v]) => [k === 'p_qty' ? 'p_quantity' : k, v]));
    const missing = Object.fromEntries(Object.entries(body1).filter(([k]) => k !== 'p_warehouse'));
    const probe = async (body) => (await server.fetch('http://pg.local/rest/v1/rpc/record_purchase', { method: 'POST', body: JSON.stringify(body) })).status;
    t.same([await probe(renamed), await probe(missing)], [404, 404], 'ضابط: جسم بمفتاح بغير اسمه أو بلا معامل إلزامي يرجع 404 (PGRST202) كما يردّ PostgREST، فلا يعبر فرق اسم بصمت');

    // ─── ٢) نتيجة record_purchase بمحلّلها، ومراتب النصّ ────────────────────────────────────────────────────────────
    const lot1 = (await db.admin("select id from public.stock_lots where source_kind = 'receipt' and source_line_id = $1 and origin_lot_id is null", [p1Ids.lineId])).rows[0]?.id;
    t.same(
      p1.value,
      {
        id: p1Ids.receiptId, docNo: 'PU-2026-0001', lineId: p1Ids.lineId, lotId: lot1, itemId: CORN, warehouseId: W.raw, warehouseName: storeName[W.raw], receivedOn: TODAY,
        qty: 1000000n, payment: 'credit', partyId: SUPPLIER, partyName: 'محمد علي', money: { unitPrice: 45000n, lineTotal: 45000000n, sellPrice: 50000n, paidNow: 0n },
      },
      'parseRecordPurchase على جواب القاعدة للأمين: المخزن الوحيد الذي اختاره الخادم، و1,000 كغم، و450 للكيلو، و450,000 دينار، والبيع 500، ولا دفع — والمال ظاهر للأمين',
    );
    t.same([p1Raw.qty, p1Raw.money.unit_price, p1Raw.money.sell_price, p1Raw.money.line_total, p1Raw.money.paid_now], ['1000.000', '450.00', '500.00', '450000', '0'], 'نصّ الجواب الخام بمراتب الإرسال (الكمية بثلاث والسعران بمرتبتين، والمبلغ دينار صحيح)');

    // P3 (المدير، SQL بأعداد بلا كسور = مراتب إدخال صفر): 1,000 × 450 = 450,000 بتاريخ 2026-11-04، وسعر البيع 520 (كُتب بعد P1 لكنّ تاريخه أقدم، فلا يصير سعر المادّة: مراجعة 0017 الأولى L2).
    const p3Ids = { ref: uid(), receipt: uid(), line: uid() };
    const p3 = await call(db, U.manager, RP, [p3Ids.ref, p3Ids.receipt, p3Ids.line, CORN, OTHER, '2026-11-04', 1000, 450, 520, 'credit', null, null]);
    t.ok(p3.ok, `المدير يسجّل الشراء نفسه بأعداد صحيحة (${p3.code ?? ''} ${p3.hint ?? ''})`);
    t.same([p3.value.qty, p3.value.money.unit_price, p3.value.money.sell_price], ['1000', '450', '520'], 'نصّ الجواب بمراتب الإدخال: «1000» و«450» لا «1000.000» و«450.00»');
    const p3Parsed = repo.parseRecordPurchase(p3.value);
    t.same([p3Parsed.qty, p3Parsed.money?.unitPrice, p3Parsed.money?.lineTotal, p3Parsed.money?.sellPrice], [p1.value.qty, p1.value.money.unitPrice, p1.value.money.lineTotal, 52000n], 'المحلّل يقرأ «1000» و«1000.000» رقماً واحداً (1,000,000 Milli)، و«450» و«450.00» سعراً واحداً (45,000 Fils)');

    // P2 (المحاسب، نقداً): 333.333 كغم × 1.50 = 499.9995 ← 500 دينار (نصفاً بعيداً عن الصفر)، بلا سعر بيع، بتاريخ 2026-11-05.
    actAs(U.accountant);
    const p2Ids = ids();
    const p2 = await outcome(repo.recordPurchase(p2Ids, { ...base, itemId: CORN, receivedOn: '2026-11-05', qty: 333333n, unitPrice: 150n, payment: 'cash', cashAccountId: BOX }));
    t.ok(p2.ok, `المحاسب يسجّل شراءً نقداً من الشاشة (${p2.code ?? ''} ${p2.hint ?? ''})`);
    t.same(
      [p2.value?.qty, p2.value?.payment, p2.value?.money],
      [333333n, 'cash', { unitPrice: 150n, lineTotal: 50000n, sellPrice: null, paidNow: 50000n }],
      'parseRecordPurchase للنقد: 333.333 كغم، و1.50 للكيلو، والمبلغ 500 دينار مقرَّباً، والمدفوع 500، وسعر البيع null بلا رمي',
    );
    t.same([JSON.parse(lastSent('record_purchase').body).p_sell_price, JSON.parse(lastSent('record_purchase').body).p_cash_account, lastReply().money.sell_price], [null, BOX, null], 'سعر بيع فارغ: يُرسل null ويرجع null، والصندوق يُرسل للنقد');

    // P4 (الأمين بنطاق الوحدة، نقداً من الصندوق، جواب المالك ١): 10.5 كغم × 460.25 = 4,832.625 ← 4,833 دينار، اليوم.
    actAs(U.storekeeper);
    const p4Ids = ids();
    const p4 = await outcome(repo.recordPurchase(p4Ids, { ...base, itemId: CORN, qty: 10500n, unitPrice: 46025n, payment: 'cash', cashAccountId: BOX }));
    t.same(
      p4.ok ? [p4.value.qty, p4.value.payment, p4.value.money] : [p4.code, p4.hint],
      [10500n, 'cash', { unitPrice: 46025n, lineTotal: 483300n, sellPrice: null, paidNow: 483300n }],
      'الأمين نقداً من الصندوق: 10.5 كغم × 460.25 = 4,832.625 ← 4,833 دينار مدفوعة (والمال ظاهر له)',
    );

    // ─── ٣) نتيجة مجهولة ثمّ إعادة: النصّ نفسه بايتاً ببايت، والجواب المحفوظ يمرّ بالمحلّل ─────────────────────────────────
    // V1 (الأمين): 40 كغم × 455 = 18,200. الجواب الأوّل يضيع بعد الثبات (504)، فالشاشة ترى UnknownOutcomeError وتعيد بالمعرّفات والمدخل نفسيهما.
    const v1Ids = ids();
    const v1Input = { ...base, itemId: CORN, qty: 40000n, unitPrice: 45500n };
    server.lose = true;
    const lost = await outcome(repo.recordPurchase(v1Ids, v1Input));
    t.same([lost.ok, lost.code], [false, 'UnknownOutcomeError'], 'جواب ضاع بعد الثبات (504): الشاشة ترى «لم يُعرف إن حُفظ» لا رفضاً');
    const lostBody = lastSent('record_purchase').body;
    const again = await outcome(repo.recordPurchase(v1Ids, v1Input));
    const againBody = lastSent('record_purchase').body;
    t.ok(again.ok, `الإعادة بالمعرّفات نفسها تنجح (${again.code ?? ''} ${again.hint ?? ''})`);
    t.eq(againBody, lostBody, 'الإعادة ترسل جسم الطلب نفسه بايتاً ببايت (decimalText بمراتب ثابتة)، فبصمة ref_claim واحدة');
    t.same(
      [again.value?.id, again.value?.lineId, again.value?.qty, again.value?.money],
      [v1Ids.receiptId, v1Ids.lineId, 40000n, { unitPrice: 45500n, lineTotal: 1820000n, sellPrice: null, paidNow: 0n }],
      'الجواب المحفوظ (ref_claim) بمحلّله: الاستلام نفسه والمال ظاهر للأمين (المخزَّن بلا قناع)',
    );
    t.eq((await db.admin('select count(*)::int as n from public.purchase_prices where line_id = $1', [v1Ids.lineId])).rows[0].n, 1, 'الإعادة لم تكتب شراءً ثانياً');
    // الطريق الثاني: المعرّفات نفسها بمرجع جديد (الإعادة بالمعرّف) ترجع purchase_result نفسه، والمحلّل يقرؤه مثل الأوّل.
    const byId = await outcome(repo.recordPurchase({ ...v1Ids, clientRef: uid() }, v1Input));
    t.same(byId.ok ? byId.value : byId.code, again.value, 'الإعادة بمعرّف الاستلام نفسه ومرجع جديد: النتيجة نفسها بالمحلّل');
    // ضابط البصمة: نفس المرجع بنصّ كمية بمراتب أخرى («40» بدل «40.000») = ref_reused، وبالنصّ نفسه = الجواب المحفوظ. فثبات النصّ شرط لا زينة.
    const sent = JSON.parse(lostBody);
    const replay = (qtyText) => call(db, U.storekeeper, RP, [sent.p_client_ref, sent.p_receipt_id, sent.p_line_id, sent.p_item, sent.p_party, sent.p_received_on, qtyText, sent.p_unit_price, sent.p_sell_price, sent.p_payment, sent.p_cash_account, sent.p_warehouse]);
    const [asText, asInt, asOne] = [await replay('40.000'), await replay('40'), await replay('40.0')];
    t.same([asText.ok ? 'ok' : asText.code, asInt.ok ? 'ok' : asInt.code, asOne.ok ? 'ok' : asOne.code], ['ok', 'ref_reused', 'ref_reused'], 'ضابط: المرجع نفسه بـ«40.000» = المحفوظ، وبـ«40» أو «40.0» = ref_reused (البصمة على النصّ)');

    // ─── ٤) القطعة وstore_required من الشاشة ────────────────────────────────────────────────────────────────────────
    // المدير نطاقه المنشأة: الأكياس تُستلم في مخزن المواد والعامّ، فـstore_required بتلميح يسمّيهما، ثمّ الإعادة بالمعرّفات نفسها ومعها العامّ.
    actAs(U.manager);
    const bagIds = ids();
    const bagInput = { ...base, itemId: BAGS, qty: 12000n, unitPrice: 750000n };
    const needStore = await outcome(repo.recordPurchase(bagIds, bagInput));
    t.same([needStore.code, needStore.hint?.includes(storeName[W.raw]) && needStore.hint?.includes(storeName[W.general])], ['store_required', true], 'القطعة بمخزنين يستلمانها: store_required برمزه للشاشة وتلميح يسمّي المخزنين');
    const bagPicked = await outcome(repo.recordPurchase(bagIds, { ...bagInput, warehouseId: W.general }));
    t.same(
      bagPicked.ok ? [bagPicked.value.warehouseId, bagPicked.value.qty, bagPicked.value.money] : [bagPicked.code, bagPicked.hint],
      [W.general, 12000n, { unitPrice: 750000n, lineTotal: 9000000n, sellPrice: null, paidNow: 0n }],
      'الإعادة بالمعرّفات نفسها ومعها المخزن العامّ (المرجع لم يُستهلك بالرفض): 12 قطعة × 7,500 = 90,000',
    );
    t.eq(JSON.parse(lastSent('record_purchase').body).p_qty, '12.000', 'كمية القطعة تُرسل بثلاث مراتب «12.000» وتقبلها الدالّة عدداً صحيحاً');
    const half = await outcome(repo.recordPurchase(ids(), { ...bagInput, qty: 12500n, warehouseId: W.general }));
    t.eq(half.code, 'pieces_not_whole', 'نصف قطعة من الشاشة («12.500»): pieces_not_whole برمزه');
    // الأمين بنطاق المعمل: مخزن المواد وحده في نطاقه فيُختار وحده؛ 5 قطع × 1,000 = 5,000.
    actAs(U.storekeeper);
    const bagKeep = await outcome(repo.recordPurchase(ids(), { ...base, itemId: BAGS, qty: 5000n, unitPrice: 100000n }));
    t.same(bagKeep.ok ? [bagKeep.value.warehouseId, bagKeep.value.money?.lineTotal] : [bagKeep.code], [W.raw, 500000n], 'الأمين بنطاق المعمل: الأكياس إلى مخزن المواد وحده بلا سؤال');

    // ─── ٥) اللتر بكثافته ───────────────────────────────────────────────────────────────────────────────────────────
    // 200.5 لتر × 1,250.25 = 250,675.125 ← 250,675 دينار، وسعر البيع 1,400.75.
    const oil = await outcome(repo.recordPurchase(ids(), { ...base, itemId: OIL, qty: 200500n, unitPrice: 125025n, sellPrice: 140075n }));
    t.same(
      oil.ok ? [oil.value.qty, oil.value.money] : [oil.code, oil.hint],
      [200500n, { unitPrice: 125025n, lineTotal: 25067500n, sellPrice: 140075n, paidNow: 0n }],
      'الزيت باللتر: 200.5 لتر × 1,250.25 = 250,675 دينار، والبيع 1,400.75',
    );

    // ─── ٦) استلامان قديمان من ورقة الاستلام (بلا purchase_prices) وشراء ملغى ─────────────────────────────────────────
    // O1 بتاريخ 2026-11-03: 250 كغم بمبلغ 112,345 ودفع 50,000 من الصندوق (< المبلغ ← «بالدين»)، فسعر الوحدة المشتقّ 112,345 ÷ 250 = 449.38.
    // O2 بتاريخ 2026-11-02: 300 كغم بمبلغ 100,000 مدفوعة كلّها (← «نقداً»)، فالسعر 100,000 ÷ 300 = 333.333… ← 333.33.
    const o1 = await postedReceipt(db, { keeper: U.storekeeper, pricer: U.manager, wh: W.raw, party: OTHER, on: '2026-11-03', lines: [{ item: CORN, qty: 250 }], totals: [112345], paid: 50000, box: BOX });
    const o2 = await postedReceipt(db, { keeper: U.storekeeper, pricer: U.manager, wh: W.raw, party: SUPPLIER, on: '2026-11-02', lines: [{ item: CORN, qty: 300 }], totals: [100000], paid: 100000, box: BOX });
    t.eq((await db.admin('select count(*)::int as n from public.purchase_prices where doc_id = any($1::uuid[])', [[o1.id, o2.id]])).rows[0].n, 0, 'الاستلامان القديمان بلا صفّ purchase_prices');
    // V1 يُلغى بيد المدير: يخرج من الملفّ والبطاقات ومجاميعهما.
    const voided = await voidReceipt(db, U.manager, v1Ids.receiptId);
    t.ok(voided.ok, `المدير يلغي الشراء V1 (${voided.code ?? ''} ${voided.hint ?? ''})`);

    // ─── ٧) ملفّ الذرة بمحلّله لكلّ دور ──────────────────────────────────────────────────────────────────────────────
    // الشراءات الفعّالة (الأحدث أوّلاً: التاريخ ثمّ وقت الترحيل): P4 (اليوم، بعد P1) ← P1 (اليوم) ← P2 (11-05) ← P3 (11-04) ← O1 (11-03) ← O2 (11-02).
    // الكمية 10.5 + 1,000 + 333.333 + 1,000 + 250 + 300 = 2,893.833 كغم؛ والمبالغ 4,833 + 450,000 + 500 + 450,000 + 112,345 + 100,000 = 1,117,678؛
    // والمتوسّط 1,117,678 ÷ 2,893.833 = 386.2275… ← 386.23؛ وآخر سعر شراء 460.25 (P4)؛ وسعر البيع 500 (P1 أحدث شراء مسعَّر بتاريخه؛ P3 بـ520 كُتب بعده بتاريخ أقدم، L2).
    const FILE_ROWS = [
      [p4Ids.lineId, TODAY, 'محمد علي', 10500n, 'cash', { unitPrice: 46025n, lineTotal: 483300n, sellPrice: null, corrected: false }],
      [p1Ids.lineId, TODAY, 'محمد علي', 1000000n, 'credit', { unitPrice: 45000n, lineTotal: 45000000n, sellPrice: 50000n, corrected: false }],
      [p2Ids.lineId, '2026-11-05', 'محمد علي', 333333n, 'cash', { unitPrice: 150n, lineTotal: 50000n, sellPrice: null, corrected: false }],
      [p3Ids.line, '2026-11-04', 'شركة الحبوب', 1000000n, 'credit', { unitPrice: 45000n, lineTotal: 45000000n, sellPrice: 52000n, corrected: false }],
      [o1.lines[0], '2026-11-03', 'شركة الحبوب', 250000n, 'credit', { unitPrice: 44938n, lineTotal: 11234500n, sellPrice: null, corrected: false }],
      [o2.lines[0], '2026-11-02', 'محمد علي', 300000n, 'cash', { unitPrice: 33333n, lineTotal: 10000000n, sellPrice: null, corrected: false }],
    ];
    const fileShape = (f) => ({
      head: [f.item.id, f.item.name, f.item.kind, f.item.baseUnit, f.item.density, f.item.archived, f.today, f.onHand, f.purchased, f.purchasesCount, f.more, f.item.tracksExpiry],
      money: f.money,
      rows: f.purchases.map((r) => [r.lineId, r.receivedOn, r.partyName, r.qty, r.payment, r.money]),
      stores: [...new Set(f.purchases.map((r) => r.warehouseName))],
    });
    const cornHead = [CORN, 'ذرة الدمج', 'raw', 'kg', null, false, TODAY, 2893833n, 2893833n, 6, false, false];
    const cornMoney = { purchasedValue: 111767800n, avgUnitPrice: 38623n, sellPrice: 50000n, lastUnitPrice: 46025n };
    const viaRepo = async (user, load) => {
      actAs(user);
      return outcome(load());
    };
    const files = {};
    for (const [label, user] of [['owner', U.owner], ['manager', U.manager], ['accountant', U.accountant], ['storekeeper', U.storekeeper], ['millOperator', U.millOperator], ['hallWorker', U.hallWorker]]) {
      const loaded = await viaRepo(user, () => repo.loadItemFile(CORN));
      t.ok(loaded.ok, `loadItemFile(${label}) من الشاشة يقرأ جواب item_file الحقيقي بلا رمي (${loaded.code ?? ''} ${loaded.error?.message ?? ''})`);
      files[label] = loaded.value;
    }
    const withMoney = (rows) => rows.map(([lineId, on, party, qty, payment, money]) => [lineId, on, party, qty, payment, money]);
    const noMoney = (rows) => rows.map(([lineId, on, party, qty, payment]) => [lineId, on, party, qty, payment, null]);
    for (const label of ['owner', 'manager', 'accountant', 'storekeeper']) {
      t.same(
        fileShape(files[label]),
        { head: cornHead, money: cornMoney, rows: withMoney(FILE_ROWS), stores: [storeName[W.raw]] },
        `parseItemFile(${label}): 2,893.833 كغم موجودة ومشتراة بستّ شراءات (الملغى خارجها)، و1,117,678 دينار بمتوسّط 386.23، وآخر سعر 460.25، والبيع 500 (أحدث شراء مسعَّر بتاريخه)، والقديمان بسعر مشتقّ (449.38 و333.33) بلا سعر بيع`,
      );
    }
    t.same(
      [files.storekeeper.canRecord, files.storekeeper.canEdit, files.storekeeper.cashAccounts, files.manager.canRecord, files.manager.canEdit, files.accountant.canRecord, files.accountant.canEdit],
      [true, false, [{ id: BOX, name: 'الصندوق' }], true, true, true, false],
      'الأمين: يسجّل ولا يعدّل المادّة، والصناديق تصله مع الملفّ؛ والمدير يسجّل ويعدّل؛ والمحاسب يسجّل ولا يعدّل',
    );
    t.same(
      [fileShape(files.millOperator), files.millOperator.canRecord, files.millOperator.cashAccounts],
      [{ head: cornHead, money: null, rows: noMoney(FILE_ROWS), stores: [storeName[W.raw]] }, false, []],
      'parseItemFile(مشغّل المعمل، مقنَّع): الكميات والشراءات نفسها، وmoney غائب بالرأس وبكلّ صفّ (null بلا رمي)، ولا يسجّل',
    );
    t.same(
      [fileShape(files.hallWorker), files.hallWorker.canRecord],
      [{ head: [CORN, 'ذرة الدمج', 'raw', 'kg', null, false, TODAY, 0n, 0n, 0, false, false], money: null, rows: [], stores: [] }, false],
      'parseItemFile(عامل القاعة، نطاقه وحدة اللحم): صفر موجود وصفر مشترى ولا صفوف، بلا مال',
    );
    // الجواب الخام للمقنَّع بلا أيّ مفتاح money بأيّ عمق (القناع، لا المحلّل، هو الذي يُخفي).
    actAs(U.millOperator);
    await repo.loadItemFile(CORN);
    t.eq(/"money"/u.test(server.replies.at(-1).text), false, 'جواب item_file الخام لمشغّل المعمل بلا أيّ مفتاح money');

    // ملفّ الزيت (الأمين): كثافة 0.92 ← 9,200 بأربع مراتب؛ 200.5 لتر بـ250,675 والمتوسّط 250,675 ÷ 200.5 = 1,250.2493… ← 1,250.25.
    actAs(U.storekeeper);
    const oilFile = await outcome(repo.loadItemFile(OIL));
    t.same(
      oilFile.ok ? fileShape(oilFile.value) : oilFile.code,
      {
        head: [OIL, 'زيت الدمج', 'raw', 'L', 9200n, false, TODAY, 200500n, 200500n, 1, false, false],
        money: { purchasedValue: 25067500n, avgUnitPrice: 125025n, sellPrice: 140075n, lastUnitPrice: 125025n },
        rows: [[oil.value?.lineId, TODAY, 'محمد علي', 200500n, 'credit', { unitPrice: 125025n, lineTotal: 25067500n, sellPrice: 140075n, corrected: false }]],
        stores: [storeName[W.raw]],
      },
      'parseItemFile(الزيت): الكثافة 0.92 بأربع مراتب، و200.5 لتر بـ250,675 دينار ومتوسّط 1,250.25 والبيع 1,400.75',
    );

    // ملفّ الأكياس: المدير يرى الشراءين من المخزنين (17 قطعة، 95,000؛ المتوسّط 95,000 ÷ 17 = 5,588.235… ← 5,588.24)، والأمين شراءه وحده.
    actAs(U.manager);
    const bagsManager = await outcome(repo.loadItemFile(BAGS));
    t.same(
      bagsManager.ok ? [bagsManager.value.onHand, bagsManager.value.purchased, bagsManager.value.purchasesCount, bagsManager.value.money, fileShape(bagsManager.value).stores.sort()] : bagsManager.code,
      [17000n, 17000n, 2, { purchasedValue: 9500000n, avgUnitPrice: 558824n, sellPrice: null, lastUnitPrice: 100000n }, [storeName[W.raw], storeName[W.general]].sort()],
      'parseItemFile(الأكياس، المدير): 17 قطعة من المخزنين بـ95,000 ومتوسّط 5,588.24، وآخر سعر 1,000 (شراء الأمين بعد شراء المدير)',
    );
    actAs(U.storekeeper);
    const bagsKeeper = await outcome(repo.loadItemFile(BAGS));
    t.same(
      bagsKeeper.ok ? [bagsKeeper.value.onHand, bagsKeeper.value.purchased, bagsKeeper.value.purchasesCount, bagsKeeper.value.money?.avgUnitPrice, fileShape(bagsKeeper.value).stores] : bagsKeeper.code,
      [5000n, 5000n, 1, 100000n, [storeName[W.raw]]],
      'parseItemFile(الأكياس، الأمين بنطاق المعمل): شراؤه وحده من مخزن المواد (العامّ خارج نطاقه)',
    );

    // ─── ٨) بطاقات المواد بمحلّلها لكلّ دور ────────────────────────────────────────────────────────────────────────
    const cardOf = (overview, itemId) => {
      const card = overview.items.find((x) => x.id === itemId);
      return card ? [card.kind, card.baseUnit, card.onHand, card.purchased, card.lastPurchaseOn, card.money] : null;
    };
    for (const [label, user, money, flags] of [
      ['owner', U.owner, true, [true, true]],
      ['manager', U.manager, true, [true, true]],
      ['accountant', U.accountant, true, [true, false]],
      ['storekeeper', U.storekeeper, true, [true, true]],
      ['millOperator', U.millOperator, false, [false, false]],
    ]) {
      const loaded = await viaRepo(user, () => repo.loadItemsOverview());
      t.ok(loaded.ok, `loadItemsOverview(${label}) يقرأ جواب items_overview الحقيقي بلا رمي (${loaded.code ?? ''} ${loaded.error?.message ?? ''})`);
      if (!loaded.ok) continue;
      const v = loaded.value;
      const bagsQty = label === 'storekeeper' || label === 'millOperator' ? 5000n : 17000n;
      t.same(
        [v.today, v.canRecord, v.canAddItem, v.items.map((x) => x.name), cardOf(v, CORN), cardOf(v, OIL), cardOf(v, BAGS)],
        [
          TODAY, ...flags, ['أكياس الدمج', 'ذرة الدمج', 'زيت الدمج'],
          ['raw', 'kg', 2893833n, 2893833n, TODAY, money ? { sellPrice: 50000n, avgUnitPrice: 38623n } : null],
          ['raw', 'L', 200500n, 200500n, TODAY, money ? { sellPrice: 140075n, avgUnitPrice: 125025n } : null],
          ['packaging', 'pc', bagsQty, bagsQty, TODAY, money ? { sellPrice: null, avgUnitPrice: bagsQty === 5000n ? 100000n : 558824n } : null],
        ],
        `parseItemsOverview(${label}): البطاقات الثلاث بالاسم، وأرقام الملفّ نفسها (الملغى خارجها)${money ? ' ومالها' : ' بلا مال'}`,
      );
    }
    const hall = await viaRepo(U.hallWorker, () => repo.loadItemsOverview());
    t.same(
      hall.ok ? [hall.value.canRecord, hall.value.canAddItem, cardOf(hall.value, CORN), cardOf(hall.value, OIL), cardOf(hall.value, BAGS)] : hall.code,
      [false, false, ['raw', 'kg', 0n, 0n, null, null], ['raw', 'L', 0n, 0n, null, null], ['packaging', 'pc', 0n, 0n, null, null]],
      'parseItemsOverview(عامل القاعة): المواد بأسمائها وصفر بنطاقه، وlast_purchase_on null، بلا مال',
    );

    // ─── ٩) من لا يسجّل الشراء: الرفض برمزه للشاشة ───────────────────────────────────────────────────────────────────
    for (const [label, user] of [['millOperator', U.millOperator], ['hallWorker', U.hallWorker]]) {
      actAs(user);
      const refused = await outcome(repo.recordPurchase(ids(), { ...base, itemId: CORN, qty: 1000n, unitPrice: 100n }));
      t.eq(refused.code, 'forbidden', `recordPurchase(${label}) من الشاشة: forbidden (RejectedError) لا رمي آخر`);
    }

    // ─── ١٠) ضابط المحلّلات: فرق مفتاح أو مرتبة في الجواب الحقيقي يرمي (فالقراءات النظيفة أعلاه ليست قبولاً لأيّ شيء) ───────────────────
    actAs(U.manager);
    await repo.loadItemFile(CORN);
    const fileRaw = JSON.parse(server.replies.at(-1).text);
    const breaks = (mutate, parse) => {
      const copy = structuredClone(fileRaw);
      mutate(copy);
      try {
        parse(copy);
        return 'parsed';
      } catch (error) {
        return error.name;
      }
    };
    t.same(
      [
        breaks((x) => { x.onhand_qty = x.on_hand_qty; delete x.on_hand_qty; }, repo.parseItemFile),
        breaks((x) => { x.purchases[0].qty = '10.5005'; }, repo.parseItemFile),
        breaks((x) => { x.money.avg_unit_price = '386.225'; }, repo.parseItemFile),
        breaks((x) => { x.purchases[0].money.unitPrice = x.purchases[0].money.unit_price; delete x.purchases[0].money.unit_price; }, repo.parseItemFile),
        breaks((x) => { x.purchases[0].payment = 'debt'; }, repo.parseItemFile),
        breaks(() => {}, repo.parseItemFile),
      ],
      ['RowShapeError', 'RowShapeError', 'RowShapeError', 'RowShapeError', 'RowShapeError', 'parsed'],
      'ضابط: مفتاح بغير اسمه، أو كمية بأربع مراتب معنوية، أو مال بثلاث، أو دفع غير معروف في جواب item_file الحقيقي = RowShapeError؛ والجواب كما هو يُقرأ',
    );
  } finally {
    delete globalThis.__buyPg;
    if (globalThis.navigator) {
      if (hadOnLine) Object.defineProperty(globalThis.navigator, 'onLine', hadOnLine);
      else delete globalThis.navigator.onLine;
    }
  }
}
