// معمل العلف، النسخة الثانية (0016، كلمة المالك 2026-11-04 وأجوبته D1–D3): create_recipe بنداء واحد (مفعَّلة، أو كلّها ترجع
// بـbasis_mismatch، وتُعاد بأمان بالمعرّف)؛ ومعدّلات تكاليف الطنّ تصير سطور تكاليف بالدفعة؛ والتحميل من المصاريف المؤهّلة الأقدم
// فالأحدث تحت قفلها (expense_overloaded، وexpense_allocated، والإلغاء يوقف التحميل)، وقيمة دفعة الناتج = السحوبات + التكاليف
// بالضبط؛ وختم الكلف يفرغ بتعديل سطر؛ ومشغّل المعمل لا يرى صفّاً من الجداول الثلاثة ولا رقماً في المعاينة؛ وadd_production_input
// (إضافة وتبديل بسبب)؛ وسعر الكلفة المكتوب للتخطيط فقط؛ ومصدر دفعة العلف المنتج رقم دفعة الإنتاج؛ وكلّ فحص جديد في verify_mill
// تكسره طفرة حقيقية (الدالّة مكسورة بمعاملة ترجع، لا صفّ مكتوب باليد).
// والدمج (القسمان ١٠ و١١): كلّ جواب جديد يمرّ بمحلّل الشاشات الحقيقي محزوماً بـesbuild، وrepo الحقيقي (postgrest-js) يصل القاعدة
// الحقيقية بـminiPostgrest، للمدير ومشغّل المعمل والمحاسب.
// الأرقام محسوبة باليد بالتعليق جنب كلّ واحد، لا منسوخة من جواب الدالّة.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { race } from './shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = {
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
};
const loaded = (result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

/** محلّلات الشاشات الحقيقية لأجوبة 0016 (الدمج، درس 2026-11-02): المصدر نفسه محزوماً بـesbuild، لا نسخة منه ولا جواب مكتوب باليد. */
async function screensParser() {
  return loaded(
    await build({
      ...BUNDLE,
      stdin: {
        contents: [
          "export { parseRecipes, parseRecipe, parsePreview, parseBatch, parseProductions, parseCreatedRecipe, parseNewRecipeVersion } from './src/lib/repo/mill.ts';",
          "export { parseItemLots, parseItemPurchases } from './src/lib/repo/inventory.ts';",
          "export { parseExpenseReport } from './src/lib/repo/cash.ts';",
        ].join('\n'),
        resolveDir: ROOT,
        loader: 'ts',
      },
    }),
  );
}

// عميل Supabase للدمج (ب): postgrest-js الحقيقي يبني الطلب كما في المتصفّح، وfetch يذهب إلى globalThis.__millPg (miniPostgrest).
const CLIENT = `
import { PostgrestClient } from '@supabase/postgrest-js';
export async function getClient() {
  const rest = new PostgrestClient('http://pg.local/rest/v1', { fetch: (...a) => globalThis.__millPg.fetch(...a) });
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: globalThis.__millPg.user }, access_token: 'a' } }, error: null }),
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

/** دوالّ repo الحقيقية التي تناديها شاشات المعمل والمادّة والمصاريف، بعميل الدمج: الطلب كما تبنيه الشاشة يصل القاعدة الحقيقية. */
async function screensRepo() {
  return loaded(
    await build({
      ...BUNDLE,
      stdin: {
        contents: [
          'export { createRecipe, loadRecipe, loadMill, loadBuilder, createProduction, previewProduction, loadBatch, addProductionInput,',
          '  deleteProductionInput, addBatchCost, setBatchCost, deleteBatchCost, addRecipeRate, setRecipeRate, deleteRecipeRate, setInputActual,',
          "  confirmCosts, postProduction, newRecipeVersion, loadMillStores, loadExpenseCategories } from './src/lib/repo/mill.ts';",
          'export { loadItemLots, loadItemPurchases, setItemCostPrice, createExpenseCategory, createItem, loadItem, updateItem, findItemTwins }',
          "  from './src/lib/repo/inventory.ts';",
          "export { loadExpenses, voidExpense } from './src/lib/repo/cash.ts';",
          "export { RejectedError } from './src/lib/errors.ts';",
        ].join('\n'),
        resolveDir: ROOT,
        loader: 'ts',
      },
      plugins: [
        {
          name: 'mill-client',
          setup(b) {
            b.onResolve({ filter: /^\.\/client$/ }, (args) => (args.importer.includes(`${path.sep}lib${path.sep}repo${path.sep}`) ? { path: 'client', namespace: 'mill-client' } : undefined));
            b.onLoad({ filter: /.*/, namespace: 'mill-client' }, () => ({ contents: CLIENT, resolveDir: ROOT, loader: 'js' }));
          },
        },
      ],
    }),
  );
}

/**
 * PostgREST مصغَّر فوق القاعدة الحقيقية لما تطلبه هذه الشاشات (الدمج ب). postgrest-js الحقيقي يبني الطلب، وهنا يصير جملة واحدة بمعاملة
 * واحدة بهويّة المستخدم (db.asUser: مطالبات JWT ودور authenticated وحدوده)، كما يفعل PostgREST. الدالّة بأسماء معاملاتها وأنواعها من
 * الكتالوج: اسم لا تعرفه أو معامل إلزامي ناقص = PGRST202 (404) كما يردّ PostgREST، فلا يعبر فرق اسم بصمت. والجدول: select بأعمدته
 * وتحويلاتها (amount::text يرجع باسم amount)، وeq وneq وgt وgte وlt وlte وis، وorder وlimit، وPrefer: return=representation؛
 * والجواب json_agg للصفوف (التواريخ نصوصاً والأعداد أعداداً كما يرسلها PostgREST)، والخطأ برمز القاعدة وتلميحه وحالة HTTP.
 * ما لا يعرفه يرمي PGRST100 باسمه (لا يخمّن).
 */
function miniPostgrest(db) {
  const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
  const RESERVED = new Set(['select', 'order', 'columns', 'limit', 'offset']);
  const signatures = new Map();
  const unsupported = (what) => Object.assign(new Error(`miniPostgrest: ${what}`), { code: 'PGRST100', status: 400 });
  const ident = (name) => {
    if (!/^[a-z_][a-z0-9_]*$/u.test(name)) throw unsupported(`identifier «${name}»`);
    return name;
  };
  const columns = (select) =>
    !select || select === '*'
      ? '*'
      : select
          .split(',')
          .map((part) => {
            const m = /^([a-z_][a-z0-9_]*)(?:::([a-z_]+))?$/u.exec(part);
            if (!m) throw unsupported(`select «${part}»`);
            return m[2] ? `${m[1]}::${m[2]} as ${m[1]}` : m[1];
          })
          .join(', ');
  const where = (params, values) => {
    const parts = [];
    for (const [key, raw] of params) {
      if (RESERVED.has(key)) continue;
      const dot = raw.indexOf('.');
      const op = raw.slice(0, dot);
      const operand = raw.slice(dot + 1);
      if (op === 'is' && ['null', 'true', 'false'].includes(operand)) parts.push(`${ident(key)} is ${operand}`);
      else if (OPS[op]) {
        values.push(operand);
        parts.push(`${ident(key)} ${OPS[op]} $${values.length}`);
      } else throw unsupported(`filter «${key}=${raw}»`);
    }
    return parts.length ? ` where ${parts.join(' and ')}` : '';
  };
  const orderBy = (order) =>
    order
      ? ` order by ${order
          .split(',')
          .map((part) => {
            const [col, dir] = part.split('.');
            return `${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}`;
          })
          .join(', ')}`
      : '';
  const param = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);

  async function rpc(fn, args) {
    if (!signatures.has(fn)) {
      const { rows } = await db.admin(
        `select coalesce(p.proargnames, '{}') as names, p.pronargs as n, p.pronargdefaults as d,
           array(select format_type(x.t, null) from unnest(p.proargtypes::oid[]) with ordinality as x(t, k) order by x.k) as types
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
        [ident(fn)],
      );
      signatures.set(fn, rows);
    }
    const keys = Object.keys(args).filter((k) => args[k] !== undefined);
    const match = signatures.get(fn).find((s) => keys.every((k) => s.names.includes(k)) && s.names.slice(0, s.n - s.d).every((k) => keys.includes(k)));
    if (!match) throw Object.assign(new Error(`Could not find the function public.${fn}(${keys.join(', ')}) in the schema cache`), { code: 'PGRST202', status: 404 });
    const typeOf = (k) => match.types[match.names.indexOf(k)];
    const sql = `select public.${fn}(${keys.map((k, i) => `${ident(k)} => $${i + 1}::${typeOf(k)}`).join(', ')}) as body`;
    const values = keys.map((k) => (args[k] === null ? null : /json/u.test(typeOf(k)) ? JSON.stringify(args[k]) : param(args[k])));
    return (await db.asUser(server.user, (q) => q(sql, values), { commit: true })).rows[0].body;
  }

  // طلب بعد طلب: عميل الحزمة اتّصال واحد، وطلبان متوازيان (loadMill) كانا يتداخلان على معاملته الواحدة؛ وPostgREST يعطي كلّ طلب اتّصاله.
  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  const server = {
    user: null,
    fetch: (url, init = {}) => serial(() => server.handle(url, init)),
    async handle(url, init) {
      const u = new URL(String(url));
      const route = u.pathname.replace(/^\/rest\/v1\//u, '');
      const method = init.method ?? 'GET';
      const prefer = String(init.headers?.Prefer ?? init.headers?.prefer ?? '');
      const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      try {
        const body = init.body ? JSON.parse(init.body) : null;
        if (route.startsWith('rpc/')) return reply(200, await rpc(route.slice('rpc/'.length), body ?? {}));
        const table = `public.${ident(route)}`;
        const values = [];
        const select = columns(u.searchParams.get('select'));
        const represent = method === 'GET' || /return=representation/u.test(prefer);
        let statement;
        if (method === 'GET') {
          const limit = u.searchParams.get('limit');
          statement = `select ${select} from ${table}${where(u.searchParams, values)}${orderBy(u.searchParams.get('order'))}${limit ? ` limit ${Number.parseInt(limit, 10)}` : ''}`;
        } else if (method === 'POST') {
          const rows = Array.isArray(body) ? body : [body];
          const cols = [...new Set(rows.flatMap((row) => Object.keys(row)))].map(ident);
          const tuples = rows.map(
            (row) =>
              `(${cols
                .map((c) => {
                  values.push(param(row[c] ?? null));
                  return `$${values.length}`;
                })
                .join(', ')})`,
          );
          statement = `insert into ${table} (${cols.join(', ')}) values ${tuples.join(', ')} returning ${select}`;
        } else if (method === 'PATCH') {
          const sets = Object.keys(body).map((c) => {
            values.push(param(body[c]));
            return `${ident(c)} = $${values.length}`;
          });
          statement = `update ${table} set ${sets.join(', ')}${where(u.searchParams, values)} returning ${select}`;
        } else throw unsupported(`method ${method}`);
        const sql = `with t as (${statement}) select coalesce(json_agg(t), '[]'::json) as body from t`;
        const out = (await db.asUser(server.user, (q) => q(sql, values), { commit: true })).rows[0].body;
        if (!represent) return reply(method === 'POST' ? 201 : 204, undefined);
        return reply(method === 'POST' ? 201 : 200, out);
      } catch (error) {
        const code = error.code ?? '';
        const status = error.status ?? (code === '23505' || code === '23503' ? 409 : code === '42501' ? 403 : 400);
        return reply(status, { code, message: error.message, details: error.detail ?? null, hint: error.hint ?? null });
      }
    },
  };
  return server;
}

const TODAY = '2026-11-04';
const id = (n) => `c2160000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477992160${String(n).padStart(2, '0')}`;
const local = (canonical) => `0${canonical.slice(3)}`;
let refs = 0;
const ref = () => id(900 + (refs += 1));

// accRaw: محاسب نطاقه مخزن المواد الأوّلية وحده (إصلاحات مراجعة 0016، ق١١): يرى الكلفة ولا يرى مصاريف وحدة المعمل.
const U = { owner: id(1), manager: id(2), miller: id(3), accountant: id(4), keeper: id(5), accRaw: id(6) };

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  for (const [i, user] of Object.values(U).entries()) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [user, phone(i + 1)]);
  }
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة المعمل الثاني', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [U.owner])).rows[0].org_id;
  const one = async (user, sql, params = []) => Object.values((await db.asUser(user, (q) => q(sql, params), { commit: true })).rows[0] ?? {})[0];
  const division = async (kind) => (await db.admin('select id from public.divisions where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const MILL = await division('feed_mill');
  const GENERAL = await division('general');
  const wh = async (kind) => (await db.admin('select id from public.warehouses where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const RAW = await wh('raw');
  const FEEDWH = await wh('feed');

  const invite = async (user, n, role, divisions = [], warehouses = []) => {
    const member = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[]) as id', [local(phone(n)), role, role, divisions, [], warehouses]);
    await db.acceptInvite(U.owner, user, member);
  };
  await invite(U.manager, 2, 'manager');
  await invite(U.miller, 3, 'mill_operator', [MILL]);
  await invite(U.accountant, 4, 'accountant');
  await invite(U.keeper, 5, 'storekeeper');
  await invite(U.accRaw, 6, 'accountant', [], [RAW]);

  /** نداء بمعاملة تثبت إذا نجح: { ok, v, rows } أو { ok: false, code, hint }. */
  const call = async (user, sql, params = []) => {
    try {
      const result = await db.asUser(user, (q) => q(sql, params), { commit: true });
      return { ok: true, v: result.rows[0] ? Object.values(result.rows[0])[0] : null, rows: result.rows, count: result.rowCount };
    } catch (error) {
      return { ok: false, code: error.message, hint: error.hint ?? null };
    }
  };
  const code = (outcome) => (outcome.ok ? 'ok' : outcome.code);
  const nonZero = async (fn) => Object.fromEntries((await db.admin(`select check_name, violations::int as n from public.${fn}() where violations <> 0`)).rows.map((r) => [r.check_name, r.n]));

  await one(U.manager, 'select public.set_division_go_live($1, public.app_today() - 10)', [MILL]);
  await one(U.manager, 'select public.set_division_go_live($1, public.app_today() - 10)', [GENERAL]);

  // ─── المواد والمورّد والصندوق وفئات المصاريف ───────────────────────────────────────────────────────────────
  const item = (name, kind, unit) => one(U.manager, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const CORN = await item('ذرة صفراء', 'raw', 'kg');
  const SOY = await item('كسبة صويا', 'raw', 'kg');
  const BRAN = await item('نخالة', 'raw', 'kg');
  const WHEAT = await item('حنطة', 'raw', 'kg');
  const SALT = await item('ملح علفي', 'raw', 'kg'); // لا شراء ولا رصيد ولا سعر كلفة: «بلا سعر»
  const YEAST = await item('خميرة معبّأة', 'raw', 'pc');
  const SACK = await item('كيس علف', 'packaging', 'pc');
  const FEED = await item('علف بادئ', 'feed', 'kg');
  const FEED2 = await item('علف ناهي', 'feed', 'kg');
  const supplier = await one(U.manager, "insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true) returning id");
  const BOX = await one(U.manager, "insert into public.cash_accounts (name, kind) values ('صندوق المعمل', 'cash') returning id");
  const category = (name) => one(U.manager, 'insert into public.expense_categories (name) values ($1) returning id', [name]);
  const LABOR = await category('أيدي عاملة');
  const POWER = await category('كهرباء');
  const TRANSPORT = await category('نقل');
  const PACKING = await category('تعبئة');
  const OLD = await category('قديمة');
  await one(U.manager, 'update public.expense_categories set archived_at = now() where id = $1 returning id', [OLD]);
  const SYSTEM = (await db.admin('select id from public.expense_categories where org_id = $1 and system_code is not null order by system_code limit 1', [org])).rows[0].id;

  /** استلام مرحَّل: كمية بوحدة الأساس ومبلغ السطر، فتصير دفعة بسعرها. */
  const receive = async (itemId, qty, total) => {
    const doc = await one(U.manager, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [supplier, RAW]);
    await one(U.manager, 'insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3) returning id', [doc, itemId, qty]);
    await one(U.manager, 'insert into public.receipt_line_amounts (line_id, line_total) select id, $2 from public.receipt_lines where doc_id = $1 returning line_id', [doc, total]);
    const out = await call(U.manager, 'select public.post_receipt($1, (select version from public.receipts where id = $1), $2)', [doc, ref()]);
    if (!out.ok) throw new Error(`استلام فشل: ${out.code} ${out.hint}`);
  };
  await receive(CORN, 2000, 1800000); // 900 للكيلو
  await receive(SOY, 1000, 1500000); // 1,500 للكيلو
  await receive(BRAN, 500, 250000); // 500 للكيلو
  await receive(WHEAT, 300, 240000); // 800 للكيلو

  // ─── ١) create_recipe: معاملة واحدة ──────────────────────────────────────────────────────────────────────────
  const createRecipe = (user, rid, vid, name, output, basis, lines, rates, activate) =>
    call(user, 'select public.create_recipe($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)', [rid, vid, name, output, basis, JSON.stringify(lines), JSON.stringify(rates), activate]);
  const R1 = id(101);
  const V1 = id(102);
  // 600 ذرة + 400 صويا = 1,000 كغم = الأساس، وتكاليف «أيدي عاملة» 5,000 و«كهرباء» 1,500 لكلّ طنّ.
  const R1_LINES = [{ item_id: CORN, qty: 600, unit: 'kg' }, { item_id: SOY, qty: 400, unit: 'kg' }];
  const R1_RATES = [{ category_id: LABOR, amount_per_ton: 5000 }, { category_id: POWER, amount_per_ton: 1500 }];
  const built = await createRecipe(U.manager, R1, V1, 'بادئ ذهبي', FEED, 1000, R1_LINES, R1_RATES, true);
  t.same(built.v, { id: R1, lines: 2, rates: 2, status: 'active', version_id: V1, version_no: 1 }, `create_recipe: الخلطة ونسختها وسطراها ومعدّلاها مفعَّلة بنداء واحد (${built.code ?? ''} ${built.hint ?? ''})`);
  const again = await createRecipe(U.manager, R1, V1, 'بادئ ذهبي', FEED, 1000, R1_LINES, R1_RATES, true);
  t.same(again.v, built.v, 'create_recipe: الإعادة بالمعرّف نفسه (جواب ضاع) ترجّع النتيجة نفسها بلا صفّ ثانٍ');
  t.eq((await db.admin('select count(*)::int as n from public.recipes where org_id = $1', [org])).rows[0].n, 1, 'ضابط: الإعادة لم تُنشئ خلطة ثانية');
  t.same(
    [
      code(await createRecipe(U.manager, R1, V1, 'بادئ فضّي', FEED, 1000, R1_LINES, R1_RATES, true)),
      code(await createRecipe(U.manager, R1, V1, 'بادئ ذهبي', FEED2, 1000, R1_LINES, R1_RATES, true)),
      code(await createRecipe(U.manager, id(111), V1, 'بادئ برونزي', FEED, 1000, R1_LINES, R1_RATES, true)),
      code(await createRecipe(U.manager, id(111), id(112), 'بادئ ذهبي', FEED, 1000, R1_LINES, R1_RATES, true)),
    ],
    ['id_conflict', 'id_conflict', 'id_conflict', 'recipe_name_taken'],
    'المعرّف نفسه باسم آخر أو منتج آخر، أو معرّف نسخة مستعمل: id_conflict؛ والاسم المأخوذ يُسمّى قبل القيد',
  );
  // 600 + 300 = 900 والأساس 1,000: الفرق −100، فلا يبقى صفّ واحد من الخلطة ولا نسختها ولا سطورها ولا معدّلها.
  const mismatch = await createRecipe(U.manager, id(103), id(104), 'ناهي', FEED2, 1000,
    [{ item_id: CORN, qty: 600, unit: 'kg' }, { item_id: SOY, qty: 300, unit: 'kg' }], [{ category_id: LABOR, amount_per_ton: 100 }], true);
  t.eq(code(mismatch), 'basis_mismatch', 'المجموع 900 والأساس 1,000 مع التفعيل: basis_mismatch');
  t.ok(/900/u.test(mismatch.hint ?? '') && /1000/u.test(mismatch.hint ?? '') && /-100/u.test(mismatch.hint ?? ''), `التلميح يسمّي المجموع والأساس والفرق (${mismatch.hint})`);
  t.same(
    (await db.admin(`select (select count(*) from public.recipes where id = $1)::int as r, (select count(*) from public.recipe_versions where id = $2)::int as v,
      (select count(*) from public.recipe_lines where version_id = $2)::int as l, (select count(*) from public.recipe_cost_rates where version_id = $2)::int as c`, [id(103), id(104)])).rows[0],
    { r: 0, v: 0, l: 0, c: 0 },
    'basis_mismatch يرجّع كلّ شيء: لا خلطة ولا نسخة ولا سطر ولا معدّل',
  );
  const R2 = id(105);
  const V2 = id(106);
  const draft = await createRecipe(U.manager, R2, V2, 'تجريبي', FEED2, 1000, [{ item_id: CORN, qty: 500, unit: 'kg' }], [], false);
  t.same([draft.v?.status, draft.v?.lines, draft.v?.rates], ['draft', 1, 0], 'بلا تفعيل: مسوّدة بسطرها ولو لم يساوِ المجموع الأساس');
  t.same(
    [
      code(await createRecipe(U.miller, id(121), id(122), 'خلطة المشغّل', FEED, 1000, R1_LINES, [], true)),
      code(await createRecipe(U.keeper, id(121), id(122), 'خلطة الأمين', FEED, 1000, R1_LINES, [], true)),
      code(await createRecipe(U.accountant, id(121), id(122), 'خلطة المحاسب', FEED, 1000, R1_LINES, [], true)),
    ],
    ['forbidden', 'forbidden', 'forbidden'],
    'create_recipe لفعل التفعيل (المالك والمدير): مشغّل المعمل والأمين والمحاسب ممنوعون',
  );
  // الحرّاس القائمة هي من يفحص: مادّة بالقطعة، وفئة مكرّرة ونظامية ومؤرشفة، ومبلغ صفر، وكمية سالبة — وكلّها ترجع بلا صفّ.
  const one000 = [{ item_id: CORN, qty: 1000, unit: 'kg' }];
  t.same(
    [
      code(await createRecipe(U.manager, id(107), id(108), 'مكيّسة', FEED2, 1000, [{ item_id: SACK, qty: 1000, unit: 'kg' }], [], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'مكرّرة', FEED2, 1000, one000, [{ category_id: LABOR, amount_per_ton: 100 }, { category_id: LABOR, amount_per_ton: 200 }], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'نظامية', FEED2, 1000, one000, [{ category_id: SYSTEM, amount_per_ton: 100 }], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'مؤرشفة', FEED2, 1000, one000, [{ category_id: OLD, amount_per_ton: 100 }], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'بلا مبلغ', FEED2, 1000, one000, [{ category_id: LABOR, amount_per_ton: 0 }], true)),
      code(await createRecipe(U.manager, id(107), id(108), 'سالبة', FEED2, 1000, [{ item_id: CORN, qty: -5, unit: 'kg' }], [], true)),
    ],
    ['bad_recipe_unit', 'category_duplicated', 'system_expense', 'category_archived', 'amount_not_positive', 'qty_not_positive'],
    'create_recipe: مادّة بالقطعة، وفئة مرّتين، وفئة نظامية، وفئة مؤرشفة، ومبلغ صفر، وكمية سالبة',
  );
  t.eq((await db.admin('select count(*)::int as n from public.recipes where id = $1', [id(107)])).rows[0].n, 0, 'ضابط: الرفض لم يترك خلطة');

  // معدّل الخلطة: كتابة مباشرة على النسخة المسوّدة وحدها، بفعل التفعيل، والفئة لا تتغيّر (عمود غير ممنوح).
  const rateSql = 'insert into public.recipe_cost_rates (version_id, category_id, amount_per_ton) values ($1, $2, $3) returning id';
  const R1_LABOR = (await db.admin('select id from public.recipe_cost_rates where version_id = $1 and category_id = $2', [V1, LABOR])).rows[0].id;
  t.same(
    [
      code(await call(U.manager, rateSql, [V1, TRANSPORT, 100])),
      code(await call(U.manager, 'update public.recipe_cost_rates set amount_per_ton = 1 where id = $1 returning id', [R1_LABOR])),
      code(await call(U.miller, rateSql, [V2, TRANSPORT, 300])),
      code(await call(U.keeper, rateSql, [V2, TRANSPORT, 300])),
    ],
    ['not_draft', 'not_draft', 'forbidden', 'forbidden'],
    'المعدّل: النسخة المفعَّلة مجمَّدة، ومشغّل المعمل والأمين ممنوعان (الحارس قبل سياسة الإدراج)',
  );
  const v2Before = (await db.admin('select version from public.recipe_versions where id = $1', [V2])).rows[0].version;
  const draftRate = await call(U.manager, rateSql, [V2, TRANSPORT, 300]);
  t.ok(draftRate.ok, `المدير يضيف معدّلاً للنسخة المسوّدة (${draftRate.code ?? ''})`);
  t.same(
    (await db.admin('select r.line_no, r.amount_per_ton::text as a, v.version from public.recipe_cost_rates r join public.recipe_versions v on v.id = r.version_id where r.id = $1', [draftRate.v])).rows[0],
    { line_no: 1, a: '300.00', version: v2Before + 1 },
    'رقم السطر الأوّل والمبلغ بمرتبتين يكتبهما الخادم، ونسخة النسخة تزيد',
  );
  t.ok(/permission denied/u.test(code(await call(U.manager, 'update public.recipe_cost_rates set category_id = $2 where id = $1', [draftRate.v, PACKING]))), 'فئة المعدّل لا تتغيّر (العمود غير ممنوح): يُحذف ويُضاف غيره');
  const rateGone = await call(U.manager, "select public.delete_draft_line('recipe_cost_rate', $1, (select version from public.recipe_versions where id = $2)) ->> 'deleted' as v", [draftRate.v, V2]);
  t.same([rateGone.v, (await db.admin('select count(*)::int as n from public.recipe_cost_rates where version_id = $1', [V2])).rows[0].n], ['true', 0], 'delete_draft_line(recipe_cost_rate) يحذف المعدّل من المسوّدة');

  // ─── ٢) معدّلات الطنّ ← سطور تكاليف الدفعة ───────────────────────────────────────────────────────────────────
  const create = (user, batch, version, kg) => call(user, 'select public.create_production($1, $2, $3, $4, $5, public.app_today())', [batch, version, kg, RAW, FEEDWH]);
  const B1 = id(201);
  const made = await create(U.miller, B1, V1, 2000);
  t.ok(made.ok, `مشغّل المعمل يسوّد دفعة 2,000 كغم (${made.code ?? ''} ${made.hint ?? ''})`);
  // أيدي عاملة 5,000 × 2,000 ÷ 1,000 = 10,000.00؛ وكهرباء 1,500 × 2,000 ÷ 1,000 = 3,000.00.
  const costsOf = async (batch) => (await db.admin(`select c.line_no, k.name, c.planned_amount::text as planned, c.amount::text as amount, c.source
    from public.production_costs c join public.expense_categories k on k.id = c.category_id where c.batch_id = $1 order by c.line_no`, [batch])).rows;
  t.same(
    await costsOf(B1),
    [
      { line_no: 1, name: 'أيدي عاملة', planned: '10000.00', amount: '10000.00', source: 'recipe' },
      { line_no: 2, name: 'كهرباء', planned: '3000.00', amount: '3000.00', source: 'recipe' },
    ],
    'سطر تكاليف لكلّ معدّل بـ_mul_div_round: 5,000 × 2,000 كغم = 10,000.00، و1,500 × 2,000 كغم = 3,000.00',
  );

  // ─── ٣) المعاينة والتحميل من المصاريف ─────────────────────────────────────────────────────────────────────────
  const preview = async (user, batch) => (await call(user, 'select public.preview_production($1)', [batch])).v;
  // بلا مصروف بعد: المتاح صفر لكلّ سطر. المواد: ذرة 1,200 × 900 = 1,080,000 وصويا 800 × 1,500 = 1,200,000 ← 2,280,000؛
  // والتكاليف 13,000 ← الكلّي 2,293,000، وكلفة الكيلو 2,293,000 ÷ 2,000 = 1,146.50.
  const p0 = await preview(U.accountant, B1);
  t.same(
    [p0.money.input_value, p0.money.extra_value, p0.money.total_value, p0.money.cost_per_kg, p0.can_post],
    ['2280000.00', '13000.00', '2293000.00', '1146.50', false],
    'المعاينة: الكلف اليدوية الحقيقية في extra_value وفي الكلّي وكلفة الكيلو',
  );
  t.same(
    p0.money.costs.map((c) => [c.line_no, c.category_name, c.planned_amount, c.amount, c.source, c.available]),
    [[1, 'أيدي عاملة', '10000.00', '10000.00', 'recipe', '0.00'], [2, 'كهرباء', '3000.00', '3000.00', 'recipe', '0.00']],
    'سطور التكاليف في المعاينة بالمحسوب والمبلغ والمتاح من المصاريف',
  );
  t.same(
    p0.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.category_name, x.need, x.have]),
    [['أيدي عاملة', '10000.00', '0.00'], ['كهرباء', '3000.00', '0.00']],
    'costs_unfunded لكلّ سطر لا يكفيه المتاح، بأرقامه لأدوار الكلفة',
  );
  const pm = await preview(U.miller, B1);
  t.same(
    [pm.money, pm.problems.map((x) => x.code), Object.keys(pm.problems.find((x) => x.code === 'costs_unfunded'))],
    [undefined, ['costs_unfunded', 'costs_pending'], ['code']],
    'مشغّل المعمل: المعاينة بلا مال، وcosts_unfunded واحدة بلا أرقام ولا فئة',
  );

  const expense = async (n, cat, div, amount, daysAgo, note = null) => {
    const out = await call(U.accountant, "select public.record_expense($1, $2, $3, $4, public.app_today() - $5::int, 'cash', $6, null, null, null, null, null, $7, null, $8)",
      [id(n), cat, div, amount, daysAgo, BOX, note, ref()]);
    if (!out.ok) throw new Error(`مصروف فشل: ${out.code} ${out.hint}`);
    return id(n);
  };
  // مصاريف لا يحمَّل منها: «أيدي عاملة» على الوحدة العامّة، و«نقل» على المعمل، و«أيدي عاملة» على المعمل أُلغي — وكلّها أقدم من المؤهّلة.
  const E4 = await expense(504, LABOR, GENERAL, 50000, 7, 'أجور المخازن');
  const E5 = await expense(505, TRANSPORT, MILL, 20000, 6, 'نقل الحبوب');
  const E6 = await expense(506, LABOR, MILL, 30000, 6, 'تسجيل خاطئ');
  t.ok((await call(U.manager, "select public.void_expense($1, 'تسجيل خاطئ', $2)", [E6, ref()])).ok, 'إلغاء مصروف لم يُحمَّل منه شيء يمرّ');
  const E1 = await expense(501, LABOR, MILL, 8000, 5, 'أجور الأسبوع الأوّل');
  const E3 = await expense(503, POWER, MILL, 4000, 3, 'كهرباء المعمل');
  const p1 = await preview(U.accountant, B1);
  t.same(
    [p1.money.costs.map((c) => c.available), p1.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.category_name, x.need, x.have])],
    [['8000.00', '4000.00'], [['أيدي عاملة', '10000.00', '8000.00']]],
    'المتاح: «أيدي عاملة» 8,000 فقط (لا العامّة ولا الملغى)، و«كهرباء» 4,000 يكفي سطرها',
  );
  const POST = "select public.post_production($1, (select version from public.production_batches where id = $1), coalesce($2, public.preview_production($1) ->> 'plan_token'), $3)";
  const post = (user, batch, plan = null) => call(user, POST, [batch, plan, ref()]);
  const overloaded = await post(U.manager, B1);
  t.same(
    [code(overloaded), overloaded.hint],
    ['expense_overloaded', 'أيدي عاملة: المطلوب 10,000 والمتاح من المصاريف المسجّلة 8,000. سجّل المصروف أوّلاً أو قلّل المبلغ.'],
    'الترحيل والمتاح أقلّ من السطر: expense_overloaded بالفئة والمطلوب والمتاح',
  );
  t.same(
    [(await db.admin('select status from public.production_batches where id = $1', [B1])).rows[0].status,
      (await db.admin('select count(*)::int as n from public.production_cost_allocations where batch_id = $1', [B1])).rows[0].n],
    ['draft', 0],
    'الرفض يرجّع كلّ شيء: الدفعة مسوّدة ولا تحميل',
  );
  const confirm = (user, batch) => call(user, 'select public.confirm_production_costs($1, (select version from public.production_batches where id = $1))', [batch]);
  // مراجعة 0016 (#1 و#8): الختم يأذن لمشغّل المعمل بالترحيل، فلا يُختم ما يُرفض ترحيله (FOUNDATION ٥٦٠): المتاح 8,000 والسطر 10,000.
  // (كان الختم يمرّ هنا فيُرفض بعده ترحيل مشغّل المعمل؛ وتلميحه بلا أرقام لمن لا يرى وحدة المدخلات في mill2-fixes.)
  const unfundedSeal = await confirm(U.accountant, B1);
  t.same(
    [code(unfundedSeal), unfundedSeal.hint, (await db.admin('select costs_confirmed_at is null as open from public.production_batches where id = $1', [B1])).rows[0].open],
    ['expense_overloaded', 'أيدي عاملة: المطلوب 10,000 والمتاح من المصاريف المسجّلة 8,000. سجّل المصروف أوّلاً أو قلّل المبلغ.', true],
    'الختم والمتاح أقلّ من السطر: expense_overloaded بأرقامه للمحاسب، والدفعة تبقى بلا ختم',
  );
  t.eq(code(await post(U.miller, B1)), 'forbidden', 'مشغّل المعمل لا يرحّل دفعة لم تُختم كلفها');
  const E2 = await expense(502, LABOR, MILL, 5000, 2, 'أجور الأسبوع الثاني');
  const p2 = await preview(U.accountant, B1);
  t.same([p2.money.costs.map((c) => c.available), p2.problems, p2.can_post], [['13000.00', '4000.00'], [], true], 'بعد مصروف ثانٍ: المتاح 13,000 يكفي، ولا مشكلة');
  t.ok((await confirm(U.accountant, B1)).ok, 'المحاسب يختم الكلف بعد أن كفتها المصاريف');
  const posted = await post(U.miller, B1);
  t.ok(posted.ok && posted.v.status === 'posted' && posted.v.money === undefined, `مشغّل المعمل يرحّل بعد الختم، وجوابه بلا مال (${posted.code ?? ''} ${posted.hint ?? ''})`);
  const DOC1 = posted.v.doc_no;
  // «أيدي عاملة» 10,000: 8,000 من E1 (الأقدم) و2,000 من E2؛ و«كهرباء» 3,000 من E3.
  t.same(
    (await db.admin(`select c.line_no, a.expense_id, a.amount::text as amount from public.production_cost_allocations a
      join public.production_costs c on c.id = a.cost_id where a.batch_id = $1 order by c.line_no, a.amount desc`, [B1])).rows,
    [{ line_no: 1, expense_id: E1, amount: '8000.00' }, { line_no: 1, expense_id: E2, amount: '2000.00' }, { line_no: 2, expense_id: E3, amount: '3000.00' }],
    'التحميل من الأقدم: سطر 10,000 يأخذ 8,000 من الأوّل و2,000 من الثاني، والكهرباء 3,000 من مصروفها',
  );
  t.same(
    [(await db.admin('select input_value::text as i, extra_value::text as e, total_value::text as t from public.production_values where batch_id = $1', [B1])).rows[0],
      (await db.admin("select qty_in::text as q, value_in::text as v from public.stock_lots where source_kind = 'production' and source_id = $1", [B1])).rows[0]],
    [{ i: '2280000.00', e: '13000.00', t: '2293000.00' }, { q: '2000.000', v: '2293000.00' }],
    'قيمة دفعة الناتج = السحوبات 2,280,000 + التكاليف 13,000 = 2,293,000.00 بالضبط (القاعدة ٢١)',
  );
  // مصدر دفعة العلف المنتج في بطاقتها: رقم دفعة الإنتاج (item_lots_qty مسطّح: source_kind وsource_id وsource).
  const lots = (await call(U.manager, 'select public.item_lots_qty($1, $2, null, 50)', [FEED, FEEDWH])).v;
  t.same(
    lots.rows.map((r) => [r.source_kind, r.source_id, r.source, r.qty_left]),
    [['production', B1, DOC1, '2000.000']],
    `دفعة العلف المنتج: مصدرها production ورقمها ${DOC1}`,
  );
  t.ok(/^PD-\d{4}-\d{4,}$/u.test(DOC1 ?? ''), `رقم الدفعة PD (${DOC1})`);
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'verify_mill وverify_stock صفر بعد ترحيل بتكاليف (حفظ القيمة يعدّ الكلف اليدوية)');

  // المحمَّل في تقرير المصاريف، وإلغاء مصروف عليه تحميل.
  const report = async () => Object.fromEntries((await call(U.accountant, 'select public.report_expenses(public.app_today() - 30, public.app_today(), null, null, 200)')).v.rows.map((r) => [r.id, r.allocated]));
  const allocated = await report();
  const reportRaw = (await call(U.accountant, 'select public.report_expenses(public.app_today() - 30, public.app_today(), null, null, 200)')).v;
  t.same([allocated[E1], allocated[E2], allocated[E3], allocated[E4], allocated[E5]], ['8000.00', '2000.00', '3000.00', '0.00', '0.00'], 'تقرير المصاريف: المحمَّل من كلّ مصروف على العلف');
  const blockedVoid = await call(U.manager, "select public.void_expense($1, 'إلغاء تجربة', $2)", [E1, ref()]);
  t.same([code(blockedVoid), blockedVoid.hint], ['expense_allocated', `من هذا المصروف 8,000 محمَّلة على دفعة الإنتاج ${DOC1}؛ ألغِ الدفعة أوّلاً.`], 'إلغاء مصروف عليه تحميل فعّال: expense_allocated يسمّي الدفعة والمبلغ');
  const voided = await call(U.manager, "select public.void_production($1, 'خطأ في الوزن', $2)", [B1, ref()]);
  t.ok(voided.ok, `إلغاء الدفعة (${voided.code ?? ''})`);
  t.same(
    (await db.admin('select count(*) filter (where voided_at is null)::int as live, count(*)::int as total from public.production_cost_allocations where batch_id = $1', [B1])).rows[0],
    { live: 0, total: 3 },
    'إلغاء الدفعة يوقف تحميلاتها الثلاثة (تبقى سجلاً بختم الإلغاء)',
  );
  t.eq((await report())[E1], '0.00', 'المحمَّل من المصروف بعد إلغاء الدفعة صفر');
  t.ok((await call(U.manager, "select public.void_expense($1, 'إلغاء بعد إلغاء الدفعة', $2)", [E1, ref()])).ok, 'إلغاء المصروف صار ممكناً بعد إلغاء الدفعة');
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بعد الإلغاءين');

  // ─── ٤) الختم يفرغ بتعديل سطر، ومشغّل المعمل لا يرى الجداول الثلاثة ──────────────────────────────────────────
  const B2 = id(202);
  t.ok((await create(U.miller, B2, V1, 1000)).ok, 'دفعة ثانية 1,000 كغم: أيدي عاملة 5,000.00 وكهرباء 1,500.00');
  const stamp = async (batch) => (await db.admin('select costs_confirmed_at is not null as s, version from public.production_batches where id = $1', [batch])).rows[0];
  const laborB2 = (await db.admin('select id from public.production_costs where batch_id = $1 and category_id = $2', [B2, LABOR])).rows[0].id;
  // المتاح بعد إلغاء B1 وE1: «أيدي عاملة» E2 (5,000) و«كهرباء» E3 (4,000)، فالسطران (5,000 و1,500) مكفيّان والختم يمرّ. (تعديل السطر
  // إلى 6,000 آخر القسم: بعده لا يُختم، مراجعة 0016 #1.)
  t.ok((await confirm(U.accountant, B2)).ok, 'ختم الدفعة الثانية والمصاريف تكفي سطريها');
  const same = await call(U.accountant, 'update public.production_costs set amount = amount where id = $1 returning id', [laborB2]);
  t.same([same.ok, (await stamp(B2)).s], [true, true], 'كتابة السطر بالمبلغ نفسه ليست تعديلاً: الختم يبقى');
  const manual = await call(U.manager, 'insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, 2000) returning line_no', [B2, TRANSPORT]);
  t.same(
    [manual.v, (await db.admin('select source, planned_amount, amount::text as a from public.production_costs where batch_id = $1 and category_id = $2', [B2, TRANSPORT])).rows[0], (await stamp(B2)).s],
    [3, { source: 'manual', planned_amount: null, a: '2000.00' }, false],
    'سطر يدوي: الرقم التالي ومصدر manual بلا محسوب، وإضافته تفرّغ الختم',
  );
  const tables = async (user) => db.asUser(user, async (q) => {
    const out = {};
    for (const table of ['production_costs', 'production_cost_allocations', 'recipe_cost_rates']) out[table] = (await q(`select count(*)::int as n from public.${table}`)).rows[0].n;
    return out;
  });
  const millerSees = await tables(U.miller);
  const managerSees = await tables(U.manager);
  t.same(millerSees, { production_costs: 0, production_cost_allocations: 0, recipe_cost_rates: 0 }, 'مشغّل المعمل: صفر صفوف من سطور التكاليف والتحميلات والمعدّلات (سياسة الكلفة المقيِّدة)');
  t.ok(managerSees.production_costs >= 5 && managerSees.production_cost_allocations === 3 && managerSees.recipe_cost_rates === 2, `ضابط: المدير يقرأها (${JSON.stringify(managerSees)})`);
  const costSql = 'insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, $3) returning id';
  t.same(
    [
      code(await call(U.miller, costSql, [B2, PACKING, 100])),
      (await call(U.miller, 'update public.production_costs set amount = 1 where id = $1', [laborB2])).count,
      code(await call(U.accountant, costSql, [B2, TRANSPORT, 100])),
      code(await call(U.accountant, costSql, [B2, SYSTEM, 100])),
      code(await call(U.accountant, costSql, [B2, PACKING, -1])),
      code(await call(U.accountant, costSql, [B1, PACKING, 100])),
    ],
    ['forbidden', 0, 'category_duplicated', 'system_expense', 'amount_required', 'not_draft'],
    'سطر الكلفة: مشغّل المعمل لا يضيف ولا يعدّل، والفئة مرّة واحدة وغير نظامية، والمبلغ لا يقلّ عن صفر، والدفعة الملغاة مجمَّدة',
  );
  t.same(
    [
      code(await call(U.accountant, "insert into public.production_costs (batch_id, category_id, amount, source) values ($1, $2, 10, 'recipe')", [B2, PACKING])),
      code(await call(U.accountant, 'update public.production_costs set category_id = $2 where id = $1', [laborB2, PACKING])),
    ],
    ['permission denied for table production_costs', 'permission denied for table production_costs'],
    'المصدر والفئة غير ممنوحين: سطر «الخلطة» لا يكتبه إلّا create_production، والفئة لا تتغيّر',
  );
  const transportB2 = (await db.admin('select id from public.production_costs where batch_id = $1 and category_id = $2', [B2, TRANSPORT])).rows[0].id;
  t.ok((await confirm(U.accountant, B2)).ok, 'ختم ثالث: «نقل» 2,000 من مصروف النقل 20,000 مكفيّ');
  const dropped = await call(U.accountant, "select public.delete_draft_line('production_cost', $1, (select version from public.production_batches where id = $2)) ->> 'deleted' as v", [transportB2, B2]);
  t.same([dropped.v, (await stamp(B2)).s], ['true', false], 'delete_draft_line(production_cost) يحذف السطر ويفرّغ الختم');
  t.ok((await confirm(U.accountant, B2)).ok, 'ختم رابع بعد حذف «نقل»');
  const sealed = await stamp(B2);
  const edited = await call(U.accountant, 'update public.production_costs set amount = 6000 where id = $1 returning amount::text', [laborB2]);
  const afterEdit = await stamp(B2);
  t.same([sealed.s, edited.v, afterEdit.s, afterEdit.version], [true, '6000.00', false, sealed.version + 1], 'تعديل مبلغ سطر بعد الختم يفرّغ الختم ويزيد نسخة الدفعة');
  const overSeal = await confirm(U.accountant, B2);
  t.same(
    [code(overSeal), overSeal.hint, (await stamp(B2)).s],
    ['expense_overloaded', 'أيدي عاملة: المطلوب 6,000 والمتاح من المصاريف المسجّلة 5,000. سجّل المصروف أوّلاً أو قلّل المبلغ.', false],
    'مراجعة 0016 (#1): ختم سطر 6,000 والمتاح 5,000 يُرفض expense_overloaded، والدفعة تبقى بلا ختم',
  );
  // بعد إلغاء B1 وE1: «أيدي عاملة» المؤهّلة E2 وحده (5,000)، والسطر 6,000 ← ناقص؛ و«كهرباء» E3 كلّه (4,000) يكفي 1,500.
  const pAcc = await preview(U.accountant, B2);
  const pMil = await preview(U.miller, B2);
  t.same(
    [pAcc.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.category_id, x.category_name, x.need, x.have]), pMil.problems],
    [[[LABOR, 'أيدي عاملة', '6000.00', '5000.00']], [{ code: 'costs_unfunded' }, { code: 'costs_pending' }]],
    'المعاينة: costs_unfunded بأرقامها للمحاسب، وبلا أرقام لمشغّل المعمل (ومعها انتظار الختم)',
  );

  // ─── ٥) add_production_input: إضافة مادّة وتبديل سطر بسبب ─────────────────────────────────────────────────────
  const add = (user, n, itemId, qty, replaces = null, reason = null) =>
    call(user, 'select public.add_production_input($1, $2, $3, $4, $5, $6)', [B2, id(n), itemId, qty, replaces, reason]);
  const v0 = (await stamp(B2)).version;
  const added = await add(U.miller, 301, BRAN, 50);
  t.same(added.v, { id: id(301), line_no: 3, version: v0 + 1 }, `مشغّل المعمل يضيف نخالة 50 كغم سطراً ثالثاً (${added.code ?? ''} ${added.hint ?? ''})`);
  const inputOf = async (n) => (await db.admin(`select planned_qty_base::text as q, planned_mass_kg::text as m, in_basis, is_substitute, reason, replaced_item_id
    from public.production_inputs where id = $1`, [id(n)])).rows[0];
  t.same(await inputOf(301), { q: '50.000', m: '50.000', in_basis: true, is_substitute: false, reason: null, replaced_item_id: null }, 'السطر المضاف: المخطّط = الكمية، والكتلة، وفي العليقة، وليس بديلاً');
  t.same((await add(U.miller, 301, BRAN, 50)).v, added.v, 'الإعادة بالمعرّف نفسه ترجّع السطر نفسه');
  const cornLine = (await db.admin('select id from public.production_inputs where batch_id = $1 and item_id = $2', [B2, CORN])).rows[0].id;
  const b1Line = (await db.admin('select id from public.production_inputs where batch_id = $1 and item_id = $2', [B1, CORN])).rows[0].id;
  t.same(
    [
      code(await add(U.miller, 301, WHEAT, 50)),
      code(await add(U.miller, 302, BRAN, 20)),
      code(await add(U.miller, 303, WHEAT, 100, cornLine)),
      code(await add(U.miller, 303, WHEAT, 100, cornLine, ' ')),
      code(await add(U.miller, 303, BRAN, 100, id(301), 'نفدت')),
      code(await add(U.miller, 303, WHEAT, 100, b1Line, 'سطر دفعة أخرى')),
      code(await add(U.miller, 303, FEED, 100)),
      code(await add(U.miller, 303, YEAST, 2)),
      code(await add(U.miller, 303, WHEAT, 0)),
      code(await add(U.accountant, 303, WHEAT, 100)),
      code(await add(U.keeper, 303, WHEAT, 100)),
    ],
    ['id_conflict', 'item_duplicated', 'reason_required', 'reason_required', 'substitute_same_item', 'line_not_found', 'item_kind_mismatch', 'bad_recipe_unit', 'qty_not_positive', 'forbidden', 'forbidden'],
    'المعرّف لمادّة أخرى، والمادّة مرّتين، والتبديل بلا سبب، وتبديل المادّة بنفسها، وسطر دفعة أخرى، والعلف الجاهز، والقطعة، والصفر، والمحاسب، والأمين',
  );
  const swapped = await add(U.miller, 304, WHEAT, 600, cornLine, 'نفدت الذرة من المخزن');
  t.ok(swapped.ok && swapped.v.line_no === 4, `التبديل: الحنطة بدل الذرة بسببها سطراً رابعاً (${swapped.code ?? ''} ${swapped.hint ?? ''})`);
  t.same(
    [await inputOf(304), (await db.admin('select count(*)::int as n from public.production_inputs where id = $1', [cornLine])).rows[0].n],
    [{ q: '600.000', m: '600.000', in_basis: true, is_substitute: true, reason: 'نفدت الذرة من المخزن', replaced_item_id: CORN }, 0],
    'السطر البديل بسببه وبمادّة ما حلّ محلّه، والسطر المبدَّل محذوف بالمعاملة نفسها',
  );
  const detailB2 = (await call(U.manager, 'select public.production_detail($1)', [B2])).v;
  t.same(
    [detailB2.lines.map((l) => [l.item_name, l.is_substitute, l.replaced_item_name]), detailB2.money.input_value, detailB2.money.costs.map((c) => c.amount)],
    [[['كسبة صويا', false, null], ['نخالة', false, null], ['حنطة', true, 'ذرة صفراء']], null, ['6000.00', '1500.00']],
    'بطاقة المسوّدة: البديل يسمّي ما حلّ محلّه، وmoney كائن بالتكاليف وقيمه فارغة قبل الترحيل',
  );
  const bran = await call(U.miller, "select public.delete_draft_line('production_input', $1, (select version from public.production_batches where id = $2)) ->> 'deleted' as v", [id(301), B2]);
  t.same([bran.v, (await db.admin('select count(*)::int as n from public.production_inputs where batch_id = $1', [B2])).rows[0].n], ['true', 2], 'delete_draft_line(production_input) يحذف سطر النخالة');
  t.same(await nonZero('verify_mill'), {}, 'verify_mill صفر بعد الإضافة والتبديل');

  // ─── ٦) سعر الكلفة المكتوب: مشروط بالسابق، وللتخطيط فقط ──────────────────────────────────────────────────────
  const costPrice = (user, itemId, price, expected) => call(user, 'select public.set_item_cost_price($1, $2, $3)', [itemId, price, expected]);
  const sellPrice = (user, itemId, price, expected) => call(user, 'select public.set_item_sell_price($1, $2, $3)', [itemId, price, expected]);
  const firstPrice = await costPrice(U.manager, CORN, 950, null);
  const repeat = await costPrice(U.manager, CORN, 950, null);
  t.same(
    [firstPrice.v, repeat.v, code(await costPrice(U.manager, CORN, 1000, null)), code(await costPrice(U.accountant, CORN, 1000, 950)), code(await costPrice(U.keeper, CORN, 1000, 950)),
      code(await costPrice(U.manager, CORN, 950.125, 950)), code(await costPrice(U.manager, CORN, 0, 950))],
    [{ item_id: CORN, written: true, cost_price: '950' }, { item_id: CORN, written: false, cost_price: '950' }, 'price_changed', 'forbidden', 'forbidden', 'bad_price', 'bad_price'],
    'سعر الكلفة: يُكتب مرّة، والإعادة «انكتب» بلا كتابة، والسابق الخاطئ price_changed، والمحاسب والأمين ممنوعان (stores.manage)، والمراتب والصفر',
  );
  const purchases = async (user) => (await call(user, 'select public.item_purchases($1, $2, null, 50)', [CORN, RAW])).v.item;
  t.same([(await purchases(U.manager)).money, (await purchases(U.miller)).money], [{ cost_price: '950', sell_price: null }, undefined], 'item_purchases يقرأ سعر الكلفة بجانب سعر البيع، ومشغّل المعمل (المخزن بنطاقه) بلا money');
  const priceRow = async () => (await db.admin('select sell_price::text as s, cost_price::text as c from public.item_prices where item_id = $1', [CORN])).rows;
  await sellPrice(U.manager, CORN, 1750, null);
  const both = await priceRow();
  await sellPrice(U.manager, CORN, null, 1750);
  const costOnly = await priceRow();
  await costPrice(U.manager, CORN, null, 950);
  const none = await priceRow();
  t.same([both, costOnly, none], [[{ s: '1750', c: '950' }], [{ s: null, c: '950' }], []], 'صفّ واحد للسعرين: شيل سعر البيع يُبقي سعر الكلفة، وشيل الاثنين يحذف الصفّ');
  await costPrice(U.manager, CORN, 950, null);

  // الدفعة الثالثة بعد كتابة سعر الكلفة: الذرة تُسحب بكلفة دفعتها (900) لا بالسعر المكتوب (950).
  // ذرة 60 × 900 = 54,000 وصويا 40 × 1,500 = 60,000 ← 114,000؛ وأيدي عاملة 500.00 (5,000 × 100 ÷ 1,000) من E2 وكهرباء 150.00 من E3
  // ← 114,650.00. ولو دخل السعر المكتوب لصارت الذرة 57,000 والكلّي 117,650.
  const B3 = id(203);
  await create(U.manager, B3, V1, 100);
  const posted3 = await post(U.manager, B3);
  t.ok(posted3.ok, `ترحيل الدفعة الثالثة (${posted3.code ?? ''} ${posted3.hint ?? ''})`);
  t.same(
    (await db.admin("select value_in::text as v from public.stock_lots where source_kind = 'production' and source_id = $1", [B3])).rows[0].v,
    '114650.00',
    'سعر الكلفة المكتوب لا يدخل قيمة دفعة المخزون أبداً: الناتج 114,650.00 من السحب الحقيقي والتكاليف',
  );
  const lots3 = (await call(U.miller, 'select public.item_lots_qty($1, $2, null, 50)', [FEED, FEEDWH])).v;
  t.same(lots3.rows.map((r) => [r.source_kind, r.source_id, r.source]), [['production', B3, posted3.v.doc_no]], 'مشغّل المعمل يرى مصدر دفعة العلف: رقم دفعة الإنتاج الثالثة');
  const detail3 = (await call(U.manager, 'select public.production_detail($1)', [B3])).v;
  const onDate = async (expenseId) => (await db.admin('select on_date::text as d from public.expenses where id = $1', [expenseId])).rows[0].d;
  t.same(
    [detail3.money.extra_value, detail3.money.total_value, detail3.money.costs.map((c) => [c.category_name, c.amount, c.allocations.map((a) => [a.expense_id, a.on_date, a.amount, a.label])])],
    ['650.00', '114650.00', [
      ['أيدي عاملة', '500.00', [[E2, await onDate(E2), '500.00', 'أجور الأسبوع الثاني']]],
      ['كهرباء', '150.00', [[E3, await onDate(E3), '150.00', 'كهرباء المعمل']]],
    ]],
    'بطاقة الدفعة: التكاليف وتحميلاتها من المصاريف بالتاريخ والمبلغ والوصف',
  );
  t.eq((await call(U.miller, 'select public.production_detail($1)', [B3])).v.money, undefined, 'مشغّل المعمل يرى البطاقة بلا مال');

  // ─── ٧) بانية الخلطة: سعر الكلفة وآخر شراء وكلفة الطنّ المتوقّعة ─────────────────────────────────────────────
  // الذرة: المكتوب 950، وآخر شراء 1,800,000 ÷ 2,000 = 900.00، ومتوسّط المتاح (1,940 كغم بـ1,746,000) = 900.00.
  // الصويا: بلا مكتوب، وآخر شراء 1,500.00، والمتوسّط 1,500.00. كلفة الطنّ المتوقّعة: 600 × 950 + 400 × 1,500 = 1,170,000.00،
  // والمعدّلات 5,000 + 1,500 = 6,500.00، فالطنّ 1,176,500.00 والكيلو 1,176.50.
  const detail = (await call(U.manager, 'select public.recipe_detail($1, null)', [R1])).v;
  t.same(
    detail.lines.map((l) => [l.item_name, l.money.unit_cost, l.money.cost_price, l.money.last_price]),
    [['ذرة صفراء', '900.00', '950', '900.00'], ['كسبة صويا', '1500.00', null, '1500.00']],
    'سطور الخلطة: متوسّط المتاح وسعر الكلفة المكتوب وآخر شراء',
  );
  t.same(
    [detail.money.rates.map((r) => [r.line_no, r.category_name, r.amount_per_ton]), detail.money.expected],
    [[[1, 'أيدي عاملة', '5000.00'], [2, 'كهرباء', '1500.00']], { unpriced: 0, cost_per_ton: '1176500.00', rates_per_ton: '6500.00', materials_per_ton: '1170000.00' }],
    'معدّلات الطنّ وكلفته المتوقّعة: المكتوب أوّلاً ثمّ آخر شراء',
  );
  t.same(detail.expense_categories.map((c) => c.name), ['أيدي عاملة', 'تعبئة', 'كهرباء', 'نقل'], 'فئات منتقي المعدّلات: الفعّالة غير النظامية (لا المؤرشفة ولا النظامية)');
  const millerDetail = (await call(U.miller, 'select public.recipe_detail($1, null)', [R1])).v;
  t.same([millerDetail.money, millerDetail.lines[0].money, millerDetail.expense_categories.length], [undefined, undefined, 4], 'مشغّل المعمل: بلا مال، والفئات (بلا مال) تصله');
  // «بادئ مملّح»: ذرة 990 بالمكتوب 950 = 940,500.00، والملح 10 كغم بلا أيّ سعر ← unpriced 1، فكلفة الكيلو في اللوحة فارغة.
  const R3 = id(113);
  t.eq((await createRecipe(U.manager, R3, id(114), 'بادئ مملّح', FEED2, 1000, [{ item_id: CORN, qty: 990, unit: 'kg' }, { item_id: SALT, qty: 10, unit: 'kg' }], [], true)).v?.status, 'active', 'خلطة فيها مادّة بلا سعر');
  t.same(
    (await call(U.manager, 'select public.recipe_detail($1, null)', [R3])).v.money.expected,
    { unpriced: 1, cost_per_ton: '940500.00', rates_per_ton: '0.00', materials_per_ton: '940500.00' },
    'المادّة بلا سعر تُعدّ (unpriced) ولا تُجمع ناقصة بصمت',
  );
  const overview = (await call(U.manager, 'select public.recipes_overview()')).v;
  const card = (rid) => overview.recipes.find((r) => r.id === rid);
  t.same([card(R1).money.expected_cost_per_kg, card(R3).money.expected_cost_per_kg, card(R2).money.expected_cost_per_kg], ['1176.50', null, null],
    'لوحة المعمل: كلفة الكيلو المتوقّعة 1,176.50، وفارغة لخلطة فيها مادّة بلا سعر ولخلطة بلا نسخة مفعَّلة');
  t.eq(card(R1).money === undefined, false, 'ضابط: المدير يرى money على البطاقة');
  t.eq((await call(U.miller, 'select public.recipes_overview()')).v.recipes.find((r) => r.id === R1).money, undefined, 'مشغّل المعمل: البطاقة بلا money');

  // ─── ٨) ضوابط verify_mill: كلّ فحص جديد تكسره طفرة حقيقية في دالّته (بمعاملة ترجع) ──────────────────────────────
  // «علف التجربة»: نخالة 1,000 كغم لأساس 1,000 و«تعبئة» 10,000 لكلّ طنّ؛ والدفعة 100 كغم بسطر تكاليف 1,000.00، ومصروفا «تعبئة»
  // 300 (الأقدم) و900: السليم يأخذ 300 ثمّ 700.
  const R4 = id(115);
  const V4 = id(116);
  t.eq((await createRecipe(U.manager, R4, V4, 'علف التجربة', FEED2, 1000, [{ item_id: BRAN, qty: 1000, unit: 'kg' }], [{ category_id: PACKING, amount_per_ton: 10000 }], true)).v?.status, 'active', 'خلطة الضوابط');
  const P1 = await expense(507, PACKING, MILL, 300, 4);
  const P2 = await expense(508, PACKING, MILL, 900, 1);
  const runBatch = async (oq, batch) => {
    await oq('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [batch, V4, RAW, FEEDWH]);
    const plan = (await oq("select public.preview_production($1) ->> 'plan_token' as p", [batch])).rows[0].p;
    await oq('select public.post_production($1, (select version from public.production_batches where id = $1), $2, $3)', [batch, plan, ref()]);
  };
  /** الطفرة: جسم الدالّة من الكتالوج بمراسيه مستبدلة (كلّ مرساة مرّة واحدة بالضبط)، ثمّ السيناريو، ثمّ الفحص؛ والمعاملة ترجع. */
  const mutated = (fns, run, verifyFn = 'verify_mill') =>
    db.asOwner(async (oq) => {
      for (const [signature, pairs] of fns) {
        const def = (await oq('select pg_get_functiondef($1::regprocedure) as d', [signature])).rows[0].d;
        let broken = def;
        for (const [from, to] of pairs) {
          if (broken.split(from).length !== 2) throw new Error(`طفرة ${signature}: المرساة ليست مرّة واحدة: ${from}`);
          broken = broken.split(from).join(to);
        }
        await oq(broken);
      }
      const extra = await run(oq);
      const found = Object.fromEntries((await oq(`select check_name, violations::int as n from public.${verifyFn}() where violations <> 0`)).rows.map((r) => [r.check_name, r.n]));
      return { found, extra };
    }, U.manager);
  const POST_FN = 'public.post_production(uuid, integer, text, uuid)';
  const control = await mutated([], async (oq) => {
    await runBatch(oq, id(401));
    return {
      allocations: (await oq('select expense_id, amount::text as a from public.production_cost_allocations where batch_id = $1 order by amount', [id(401)])).rows,
      labels: (await oq('select public.production_detail($1) -> \'money\' -> \'costs\' -> 0 -> \'allocations\' as a', [id(401)])).rows[0].a.map((a) => a.label),
    };
  });
  t.same(
    [control.found, control.extra.allocations, control.extra.labels],
    [{}, [{ expense_id: P1, a: '300.00' }, { expense_id: P2, a: '700.00' }], ['نقداً من صندوق المعمل', 'نقداً من صندوق المعمل']],
    'ضابط السيناريو السليم: الثوابت صفر، والتحميل 300 ثمّ 700، ووصف المصروف بلا ملاحظة «نقداً من» صندوقه',
  );
  const cases = [
    ['production_extra_value', [[POST_FN, [['v_extra := v_extra + c.amount;', 'v_extra := v_extra + 0;']]]], 'الترحيل يتجاهل التكاليف في extra_value وقيمة الناتج'],
    ['production_cost_allocated', [[POST_FN, [['v_left := v_left - v_take;', 'v_left := 0;']]]], 'الترحيل يكتفي بأوّل مصروف (300 من سطر 1,000)'],
    ['expense_over_allocated', [[POST_FN, [['v_take := round(least(v_left, e.free), 2);', 'v_take := v_left;']]]], 'الترحيل يحمّل السطر كلّه على أوّل مصروف (1,000 من مصروف 300)'],
    // مراجعة 0016 (#0): التحميل ممّا قفلته جملة القفل وحدها، فـ«أيّ فئة» تُنسى في الجملتين معاً (القفل والحلقة).
    ['allocation_mismatch', [[POST_FN, [['x.category_id = c.category_id and ', ''],
      ['and x.category_id in (select pc.category_id from public.production_costs pc where pc.org_id = v_org and pc.batch_id = d.id and pc.amount > 0)', '']]]],
    'الترحيل يحمّل من مصروف أيّ فئة (الأقدم «نقل»)'],
  ];
  for (const [check, fns, label] of cases) {
    const outcome = await mutated(fns, (oq) => runBatch(oq, id(402)));
    t.same(outcome.found, { [check]: 1 }, `طفرة: ${label} ← ${check} وحده`);
  }
  const voidFn = 'public.void_production(uuid, text, uuid)';
  const unvoided = await mutated([[voidFn, [['update public.production_cost_allocations set voided_at = now()\n  where org_id = v_org and batch_id = d.id and voided_at is null;', 'perform 1;']]]], async (oq) => {
    await runBatch(oq, id(403));
    await oq("select public.void_production($1, 'طفرة الإلغاء', $2)", [id(403), ref()]);
  });
  t.same(unvoided.found, { allocation_on_void: 2 }, 'طفرة: إلغاء الدفعة لا يوقف تحميليها ← allocation_on_void = 2');
  const expenseFn = 'public.void_expense(uuid, text, uuid)';
  const unguarded = await mutated([[expenseFn, [['if v_allocated is not null then', 'if false then']]]], async (oq) => {
    await runBatch(oq, id(404));
    await oq("select public.void_expense($1, 'طفرة المصروف', $2)", [P1, ref()]);
  });
  t.same(unguarded.found, { allocation_on_void: 1 }, 'طفرة: إلغاء مصروف عليه تحميل بلا فحص ← allocation_on_void = 1');
  const guarded = await db.asOwner(async (oq) => {
    await runBatch(oq, id(404));
    await oq("select public.void_expense($1, 'بلا طفرة', $2)", [P1, ref()]);
    return 'مرّ';
  }, U.manager).catch((error) => error.message);
  t.eq(guarded, 'expense_allocated', 'ضابط: الإلغاء السليم يرفض expense_allocated في السيناريو نفسه');
  const inputFn = 'public.add_production_input(uuid, uuid, uuid, numeric, uuid, text)';
  const noReason = await mutated([[inputFn, [['if v_reason is null or length(v_reason) < 3 then', 'if false then'],
    ["i.kind not in ('fuel', 'packaging'), p_replaces is not null, v_reason, o.item_id);", "i.kind not in ('fuel', 'packaging'), p_replaces is not null, null, o.item_id);"]]]], async (oq) => {
    await oq('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [id(405), V4, RAW, FEEDWH]);
    const line = (await oq('select id from public.production_inputs where batch_id = $1', [id(405)])).rows[0].id;
    await oq("select public.add_production_input($1, $2, $3, 100, $4, 'نفدت النخالة')", [id(405), id(406), WHEAT, line]);
  });
  t.same(noReason.found, { production_substitute_reason: 1 }, 'طفرة: التبديل يحفظ البديل بلا سببه ← production_substitute_reason');
  // حفظ القيمة في verify_stock يعدّ الكلف اليدوية للمرحَّلة: بلا الحدّ الجديد تصير كلّ منشأة رحّلت دفعة بتكاليف خرقاً، ولا غيرها.
  // الثابت يعدّ المنشآت المخالفة في القاعدة كلّها (ومنها منشآت ملفّات قبله)، فالمتوقّع عددها بالضبط، وهو واحد على الأقلّ (هذه المنشأة).
  const noExtra = await mutated([['public.verify_stock()', [["\n      + coalesce((select sum(pv.extra_value) from public.production_values pv join public.production_batches b on b.org_id = pv.org_id and b.id = pv.batch_id\n          where pv.org_id = o.id and b.status = 'posted'), 0) as inputs,", ' as inputs,']]]],
    async (oq) => (await oq(`select count(distinct b.org_id)::int as n from public.production_batches b
      join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id where b.status = 'posted' and pv.extra_value > 0`)).rows[0].n,
    'verify_stock');
  t.ok(noExtra.extra >= 1, `منشآت رحّلت دفعة بتكاليف (${noExtra.extra})`);
  t.same(noExtra.found, { value_conservation: noExtra.extra }, 'طفرة: حفظ القيمة بلا الكلف اليدوية يرى كلّ منشأة رحّلت دفعة بتكاليف خرقاً، فالحدّ الجديد لازم');
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بعد الطفرات (رجعت كلّها)');

  // ─── ٩) التزامن: الترحيل يعيد فحص المتاح تحت قفل صفوف المصاريف (جلستان حقيقيتان) ──────────────────────────────
  // المتاح من «تعبئة» 1,200 (300 + 900) وكلّ دفعة 100 كغم تحتاج 1,000. ضابط: الأولى ترجع فالثانية تأخذ حاجتها بعد انتظارها.
  const X = id(210);
  const Y = id(211);
  const Z = id(212);
  for (const batch of [X, Y, Z]) await create(U.manager, batch, V4, 100);
  const rolledBack = await race(db, { user: U.manager, sql: POST, params: [X, null, ref()], rollback: true }, { user: U.accountant, sql: POST, params: [Y, null, ref()] });
  t.same([rolledBack.first, rolledBack.state, rolledBack.second], ['ok', 'blocked', 'ok'], 'ضابط: ترحيل الأولى رجع، فالثانية انتظرت ثمّ حمّلت 1,000 من 1,200');
  // بعد Y: المتبقّي 200 من الثاني. مصروف ثالث 1,000 ← المتاح 1,200 لدفعة واحدة فقط: الأولى تأخذ 200 + 800، والثانية تنتظر ثمّ
  // ترى 200 فقط فترفض expense_overloaded بدل أن تحمّل فوق المبلغ.
  const P3 = await expense(509, PACKING, MILL, 1000, 0);
  const lost = await race(db, { user: U.manager, sql: POST, params: [X, null, ref()] }, { user: U.accountant, sql: POST, params: [Z, null, ref()] });
  t.same([lost.first, lost.state, lost.second], ['ok', 'blocked', 'expense_overloaded'], 'ترحيلان على مصروف واحد بنفس اللحظة: الثاني ينتظر قفل المصروف ثمّ يرى ما بقي فيرفض');
  t.same(
    (await db.admin('select expense_id, sum(amount)::text as a from public.production_cost_allocations where voided_at is null and expense_id = any ($1) group by expense_id order by expense_id', [[P1, P2, P3]])).rows,
    [{ expense_id: P1, a: '300.00' }, { expense_id: P2, a: '900.00' }, { expense_id: P3, a: '800.00' }].sort((a, b) => (a.expense_id < b.expense_id ? -1 : 1)),
    'لا مصروف فوق مبلغه بعد السباق: 300 و900 كاملان، و800 من 1,000',
  );
  // إلغاء مصروف بنفس لحظة ترحيل يحمّل منه: الإلغاء ينتظر قفل الصفّ ثمّ يرى التحميل فيرفض expense_allocated.
  const P4 = await expense(510, PACKING, MILL, 2000, 0);
  const voidRace = await race(db, { user: U.manager, sql: POST, params: [Z, null, ref()] }, { user: U.owner, sql: "select public.void_expense($1, 'إلغاء بنفس اللحظة', $2)", params: [P4, ref()] });
  t.same([voidRace.first, voidRace.state, voidRace.second], ['ok', 'blocked', 'expense_allocated'], 'إلغاء المصروف ينتظر الترحيل الذي يقفله ثمّ يرى تحميله فيرفض');
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بعد السباق');

  // ─── ١٠) الدمج (أ): جواب القاعدة الحقيقي بمحلّلات الشاشات الحقيقية (esbuild)، للمدير والمحاسب ومشغّل المعمل ─────────────────
  // درس 2026-11-02: الشاشات بُنيت على العقد بلا قاعدة، فكلّ جواب جديد من 0016 التقطته الأقسام أعلاه يمرّ هنا بمحلّله الحقيقي؛ وفرق
  // مفتاح أو مرتبة أو نوع يرمي (MillShapeError وRowShapeError وLedgerShapeError) أو يطلع رقماً غير المحسوب باليد هناك.
  const ui = await screensParser();
  /** المحلّل يرمي = فحص فاشل باسمه، لا توقّف الملف: كلّ فرق يظهر في التشغيل نفسه. */
  const parsed = (label, fn) => {
    try {
      return fn();
    } catch (error) {
      t.ok(false, `${label}: المحلّل رمى ${error.message}`);
      return null;
    }
  };
  t.same(parsed('parseCreatedRecipe', () => ui.parseCreatedRecipe(built.v)), { id: R1, versionId: V1, versionNo: 1, status: 'active', lines: 2, rates: 2 }, 'parseCreatedRecipe: جواب create_recipe المفعَّل');
  t.same(parsed('parseCreatedRecipe (مسوّدة)', () => ui.parseCreatedRecipe(draft.v)), { id: R2, versionId: V2, versionNo: 1, status: 'draft', lines: 1, rates: 0 }, 'parseCreatedRecipe: المسوّدة بسطرها وبلا معدّل');

  // المعاينة الأولى للمحاسب (القسم ٣): المواد 2,280,000.00 والتكاليف 13,000.00 والكلّي 2,293,000.00 والكيلو 1,146.50، بالفلس.
  const view0 = parsed('parsePreview (المحاسب)', () => ui.parsePreview(p0));
  t.same(
    view0 && [view0.inputValue, view0.extraValue, view0.totalValue, view0.costPerKg, view0.canPost, view0.lines.map((l) => [l.itemName, l.plannedQty, l.drawQty, l.value])],
    [228000000n, 1300000n, 229300000n, 114650n, false, [['ذرة صفراء', 1200000n, 1200000n, 108000000n], ['كسبة صويا', 800000n, 800000n, 120000000n]]],
    'parsePreview (المحاسب): المال بالفلس والكميات بالآلاف، وقيمة كلّ مدخل من سحبه (1,200 × 900 و800 × 1,500)',
  );
  t.same(
    view0?.costs?.map((c) => [c.lineNo, c.categoryId, c.categoryName, c.plannedAmount, c.amount, c.source, c.available, c.allocations]),
    [[1, LABOR, 'أيدي عاملة', 1000000n, 1000000n, 'recipe', 0n, []], [2, POWER, 'كهرباء', 300000n, 300000n, 'recipe', 0n, []]],
    'parsePreview: سطور التكاليف بالمحسوب والمبلغ والمتاح (صفر قبل أيّ مصروف)',
  );
  t.same(
    view0?.problems.map((x) => [x.code, x.categoryId, x.categoryName, x.needAmount, x.haveAmount, x.need, x.have]),
    [['costs_unfunded', LABOR, 'أيدي عاملة', 1000000n, 0n, null, null], ['costs_unfunded', POWER, 'كهرباء', 300000n, 0n, null, null]],
    'parsePreview: costs_unfunded مالاً بمرتبتين (needAmount وhaveAmount)، لا كمية',
  );
  // مخزن المدخلات بوحدته (مراجعة 0016، ق١٥ وم٤): التنبيه ورابط «سجّل مصروفاً» يسمّيان الوحدة التي تُحمَّل التكاليف من مصاريفها.
  const nameOf = async (table, rowId) => (await db.admin(`select name from public.${table} where id = $1`, [rowId])).rows[0].name;
  const RAW_NAME = await nameOf('warehouses', RAW);
  const FEEDWH_NAME = await nameOf('warehouses', FEEDWH);
  const MILL_NAME = await nameOf('divisions', MILL);
  t.same(view0?.inputWarehouse, { id: RAW, name: RAW_NAME, divisionId: MILL, divisionName: MILL_NAME }, `parsePreview: مخزن المدخلات بوحدته (division_id وdivision_name: «${MILL_NAME}»)`);
  const viewMiller = parsed('parsePreview (مشغّل المعمل)', () => ui.parsePreview(pm));
  t.same(
    viewMiller && [viewMiller.inputValue, viewMiller.extraValue, viewMiller.totalValue, viewMiller.costPerKg, viewMiller.costs, viewMiller.lines.map((l) => l.value), viewMiller.canPost],
    [null, null, null, null, null, [null, null], false],
    'parsePreview (مشغّل المعمل): بلا money كلّه، فالمال والتكاليف فارغة ولا يرمي',
  );
  t.same(
    viewMiller?.problems.map((x) => [x.code, x.categoryId, x.categoryName, x.needAmount, x.haveAmount]),
    [['costs_unfunded', null, null, null, null], ['costs_pending', null, null, null, null]],
    'parsePreview (مشغّل المعمل): costs_unfunded بلا فئة ولا أرقام، وانتظار الختم',
  );
  t.same(viewMiller?.inputWarehouse, view0?.inputWarehouse, 'parsePreview (مشغّل المعمل): مخزن المدخلات بوحدته بلا مال');
  const view2 = parsed('parsePreview (بعد المصروف الثاني)', () => ui.parsePreview(p2));
  t.same(view2 && [view2.costs.map((c) => c.available), view2.problems, view2.canPost], [[1300000n, 400000n], [], true], 'parsePreview: بعد المصروف الثاني المتاح 13,000.00 و4,000.00 ولا مشكلة');
  // الدفعة الثانية (1,000 كغم، القسم ٤): المواد 600 × 900 + 400 × 1,500 = 1,140,000.00، والتكاليف 6,000 + 1,500 = 7,500.00،
  // والكلّي 1,147,500.00، والكيلو 1,147.50؛ والمتاح بعد إلغاء الأولى: «أيدي عاملة» 5,000.00 و«كهرباء» 4,000.00.
  const viewB2 = parsed('parsePreview (الدفعة الثانية)', () => ui.parsePreview(pAcc));
  t.same(
    viewB2 && [viewB2.inputValue, viewB2.extraValue, viewB2.totalValue, viewB2.costPerKg, viewB2.costs.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.available])],
    [114000000n, 750000n, 114750000n, 114750n, [[1, 'أيدي عاملة', 500000n, 600000n, 500000n], [2, 'كهرباء', 150000n, 150000n, 400000n]]],
    'parsePreview (الدفعة الثانية): المبلغ المعدَّل بجانب المحسوب، والمتاح بعد إلغاء الأولى',
  );
  t.same(viewB2?.problems.map((x) => [x.code, x.categoryId, x.needAmount, x.haveAmount]), [['costs_unfunded', LABOR, 600000n, 500000n]], 'parsePreview: النقص 6,000.00 مقابل 5,000.00');
  const viewB2Miller = parsed('parsePreview (الدفعة الثانية، مشغّل المعمل)', () => ui.parsePreview(pMil));
  t.same(
    viewB2Miller && [viewB2Miller.costs, viewB2Miller.problems.map((x) => [x.code, x.needAmount, x.haveAmount])],
    [null, [['costs_unfunded', null, null], ['costs_pending', null, null]]],
    'parsePreview (مشغّل المعمل، الدفعة الثانية): بلا تكاليف ولا أرقام',
  );

  // بطاقة المسوّدة بعد الإضافة والتبديل (القسم ٥): صويا 400 ونخالة 50 وحنطة 600 بديلاً للذرة، والمال فارغ قبل الترحيل.
  const batchB2 = parsed('parseBatch (مسوّدة)', () => ui.parseBatch(detailB2));
  t.same(
    batchB2 && [batchB2.status, batchB2.docNo, batchB2.inputValue, batchB2.extraValue, batchB2.totalValue, batchB2.costPerKg,
      batchB2.lines.map((l) => [l.itemName, l.plannedQty, l.usedQty, l.isSubstitute, l.reason, l.replacedItemName, l.value, l.draws])],
    ['draft', null, null, null, null, null, [
      ['كسبة صويا', 400000n, null, false, null, null, null, null],
      ['نخالة', 50000n, null, false, null, null, null, null],
      ['حنطة', 600000n, null, true, 'نفدت الذرة من المخزن', 'ذرة صفراء', null, null],
    ]],
    'parseBatch (مسوّدة): البديل باسم ما حلّ محلّه وسببه، والمال فارغ قبل الترحيل',
  );
  t.same(
    batchB2?.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.source, c.available, c.allocations]),
    [[1, 'أيدي عاملة', 500000n, 600000n, 'recipe', null, []], [2, 'كهرباء', 150000n, 150000n, 'recipe', null, []]],
    'parseBatch (مسوّدة): التكاليف تحت money ولو كانت قيمه فارغة',
  );
  // الدفعة الثالثة (100 كغم، القسم ٦): ذرة 60 × 900 = 54,000 وصويا 40 × 1,500 = 60,000، والتكاليف 500 + 150 = 650.00،
  // والكلّي 114,650.00 والكيلو 1,146.50.
  const batch3 = parsed('parseBatch (مرحَّلة)', () => ui.parseBatch(detail3));
  t.same(
    batch3 && [batch3.status, batch3.docNo, batch3.outputQtyKg, batch3.inputValue, batch3.extraValue, batch3.totalValue, batch3.costPerKg, batch3.lines.map((l) => [l.itemName, l.usedQty, l.value])],
    ['posted', posted3.v.doc_no, 100000n, 11400000n, 65000n, 11465000n, 114650n, [['ذرة صفراء', 60000n, 5400000n], ['كسبة صويا', 40000n, 6000000n]]],
    'parseBatch (مرحَّلة): المسحوب وقيمته، والمال بالفلس',
  );
  t.same(
    batch3?.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.available, c.allocations.map((a) => [a.expenseId, a.onDate, a.amount, a.label])]),
    [
      [1, 'أيدي عاملة', 50000n, 50000n, null, [[E2, await onDate(E2), 50000n, 'أجور الأسبوع الثاني']]],
      [2, 'كهرباء', 15000n, 15000n, null, [[E3, await onDate(E3), 15000n, 'كهرباء المعمل']]],
    ],
    'parseBatch (مرحَّلة): التحميلات بالمصروف وتاريخه ومبلغه ووصفه',
  );
  // من أيّ وجبات سُحب كلّ سطر (ق١٦، م١٣): وجبة استلام الذرة الوحيدة (2,000 كغم) ووجبة الصويا، بالكمية موجبة ورقم الاستلام.
  const receiptLot = async (itemId) => (await db.admin(`select l.id, r.doc_no from public.stock_lots l join public.receipts r on r.id = l.source_id
    where l.org_id = $1 and l.item_id = $2 and l.warehouse_id = $3 and l.source_kind = 'receipt'`, [org, itemId, RAW])).rows;
  const [cornLot] = await receiptLot(CORN);
  const [soyLot] = await receiptLot(SOY);
  t.same(
    batch3?.lines.map((l) => [l.itemName, l.draws?.map((d) => [d.lotId, d.qty, d.receivedOn, d.source])]),
    [['ذرة صفراء', [[cornLot.id, 60000n, TODAY, cornLot.doc_no]]], ['كسبة صويا', [[soyLot.id, 40000n, TODAY, soyLot.doc_no]]]],
    `parseBatch (مرحَّلة): draws لكلّ سطر من وجبته ورقم استلامها (${cornLot.doc_no} و${soyLot.doc_no})`,
  );
  // والملغاة تبقى تقول من أين سُحبت (السحوبات الأصلية بلا عكسها): الأولى 1,200 ذرة و800 صويا.
  const detail1Raw = (await call(U.manager, 'select public.production_detail($1)', [B1])).v;
  const batch1 = parsed('parseBatch (ملغاة)', () => ui.parseBatch(detail1Raw));
  t.same(
    batch1 && [batch1.status, batch1.lines.map((l) => [l.itemName, l.draws?.map((d) => [d.lotId, d.qty, d.source])])],
    ['void', [['ذرة صفراء', [[cornLot.id, 1200000n, cornLot.doc_no]]], ['كسبة صويا', [[soyLot.id, 800000n, soyLot.doc_no]]]]],
    'parseBatch (ملغاة): draws بالسحوبات الأصلية، لا صفر ولا null',
  );
  const batch3MillerRaw = (await call(U.miller, 'select public.production_detail($1)', [B3])).v;
  const batch3Miller = parsed('parseBatch (مشغّل المعمل)', () => ui.parseBatch(batch3MillerRaw));
  t.same(
    batch3Miller && [batch3Miller.costs, batch3Miller.inputValue, batch3Miller.extraValue, batch3Miller.totalValue, batch3Miller.costPerKg, batch3Miller.lines.map((l) => [l.usedQty, l.value])],
    [null, null, null, null, null, [[60000n, null], [40000n, null]]],
    'parseBatch (مشغّل المعمل): الكميات بلا مال ولا تكاليف، ولا يرمي',
  );

  // مصدر دفعة العلف (ج٦، المفتاح المسطّح القائم منذ 0007): رقم دفعة الإنتاج.
  const lotsManager = parsed('parseItemLots (المدير)', () => ui.parseItemLots(lots));
  t.same(
    lotsManager && [lotsManager.item.kind, lotsManager.rows.map((r) => [r.sourceKind, r.sourceId, r.source, r.qtyLeft])],
    ['feed', [['production', B1, DOC1, 2000000n]]],
    'parseItemLots: دفعة العلف المنتج مصدرها الإنتاج ورقم دفعته (2,000 كغم)',
  );
  t.same(
    parsed('parseItemLots (مشغّل المعمل)', () => ui.parseItemLots(lots3))?.rows.map((r) => [r.sourceKind, r.sourceId, r.source, r.qtyLeft]),
    [['production', B3, posted3.v.doc_no, 100000n]],
    'parseItemLots (مشغّل المعمل): رقم الدفعة الثالثة',
  );

  // سعر الكلفة المكتوب 950 (القسم ٦) بجانب سعر البيع الفارغ، وآخر شراء 1,800,000 ÷ 2,000 = 900.00.
  const purchasesOf = async (user) => (await call(user, 'select public.item_purchases($1, $2, null, 50)', [CORN, RAW])).v;
  const buysManagerRaw = await purchasesOf(U.manager);
  const buysMillerRaw = await purchasesOf(U.miller);
  const buysManager = parsed('parseItemPurchases (المدير)', () => ui.parseItemPurchases(buysManagerRaw));
  t.same(
    buysManager && [buysManager.item.costPrice, buysManager.item.sellPrice, buysManager.rows.length, buysManager.rows[0].qtyIn, buysManager.rows[0].money],
    [95000n, null, 1, 2000000n, { invoiceTotal: 180000000n, landedValue: 180000000n, unitCost: 90000n, corrected: false }],
    'parseItemPurchases: سعر الكلفة 950.00 بالفلس بجانب سعر البيع الفارغ، وكلفة وحدة الشراء 900.00',
  );
  t.eq(buysManager?.lastProduction, null, 'parseItemPurchases: last_production null لمادّة أوّلية لم تُصنع (المفتاح موجود بقيمته)');
  const buysMiller = parsed('parseItemPurchases (مشغّل المعمل)', () => ui.parseItemPurchases(buysMillerRaw));
  t.same(buysMiller && [buysMiller.item.costPrice, buysMiller.item.sellPrice, buysMiller.rows[0].money], [null, null, null], 'parseItemPurchases (مشغّل المعمل): بلا أسعار ولا مال');

  // تقرير المصاريف بعد ترحيل الأولى (القسم ٣): المحمَّل 8,000 و2,000 و3,000، وصفر على العامّة والنقل والملغى.
  const report0 = parsed('parseExpenseReport', () => ui.parseExpenseReport(reportRaw));
  const expenseRow = (expenseId) => report0?.rows.find((r) => r.id === expenseId);
  t.same(
    [E1, E2, E3, E4, E5].map((x) => [expenseRow(x)?.amount, expenseRow(x)?.allocated]),
    [[800000n, 800000n], [500000n, 200000n], [400000n, 300000n], [5000000n, 0n], [2000000n, 0n]],
    'parseExpenseReport: المحمَّل على العلف من كلّ مصروف بالفلس',
  );
  const reversal = report0?.rows.find((r) => r.reverses === E6);
  t.same([expenseRow(E6)?.reversed, reversal?.amount, reversal?.allocated], [true, -3000000n, 0n], 'parseExpenseReport: صفّ الإلغاء بمبلغه السالب ومحمَّله صفر');

  // بطاقة الخلطة (القسم ٧): الذرة المكتوب 950 وآخر شراء 900 ومتوسّط المتاح 900، والصويا 1,500 بلا مكتوب؛ والطنّ 1,176,500.00.
  const recipeManager = parsed('parseRecipe (المدير)', () => ui.parseRecipe(detail));
  t.same(
    recipeManager?.lines.map((l) => [l.itemName, l.unitCost, l.costPrice, l.lastPrice]),
    [['ذرة صفراء', 90000n, 95000n, 90000n], ['كسبة صويا', 150000n, null, 150000n]],
    'parseRecipe: متوسّط المتاح وسعر الكلفة المكتوب وآخر شراء بالفلس',
  );
  t.same(
    recipeManager && [recipeManager.rates.map((r) => [r.lineNo, r.categoryId, r.categoryName, r.amountPerTon]), recipeManager.expected, recipeManager.expenseCategories.map((c) => c.name)],
    [[[1, LABOR, 'أيدي عاملة', 500000n], [2, POWER, 'كهرباء', 150000n]], { materialsPerTon: 117000000n, ratesPerTon: 650000n, costPerTon: 117650000n, unpriced: 0 }, ['أيدي عاملة', 'تعبئة', 'كهرباء', 'نقل']],
    'parseRecipe: معدّلات الطنّ وكلفته المتوقّعة والفئات',
  );
  const recipeMiller = parsed('parseRecipe (مشغّل المعمل)', () => ui.parseRecipe(millerDetail));
  t.same(
    recipeMiller && [recipeMiller.rates, recipeMiller.expected, recipeMiller.lines.map((l) => [l.unitCost, l.costPrice, l.lastPrice]), recipeMiller.expenseCategories.length],
    [null, null, [[null, null, null], [null, null, null]], 4],
    'parseRecipe (مشغّل المعمل): بلا مال، والفئات تصله، ولا يرمي',
  );
  const saltedRaw = (await call(U.manager, 'select public.recipe_detail($1, null)', [R3])).v;
  t.same(
    parsed('parseRecipe (بادئ مملّح)', () => ui.parseRecipe(saltedRaw))?.expected,
    { materialsPerTon: 94050000n, ratesPerTon: 0n, costPerTon: 94050000n, unpriced: 1 },
    'parseRecipe: المادّة بلا سعر تُعدّ (unpriced) ولا تُجمع ناقصة',
  );
  const cards = parsed('parseRecipes (المدير)', () => ui.parseRecipes(overview));
  const cardOf = (list, recipeId) => list?.find((c) => c.id === recipeId);
  const goldCard = cardOf(cards, R1);
  t.same(
    goldCard && [goldCard.expectedCostPerKg, goldCard.batches, goldCard.lastBatch?.docNo, goldCard.lastCostPerKg, goldCard.activeLines, goldCard.pieces.map((p) => [p.label, p.weight])],
    [117650n, 1, posted3.v.doc_no, 114650n, 2, [['ذرة صفراء', 600000n], ['كسبة صويا', 400000n]]],
    'parseRecipes: كلفة الكيلو المتوقّعة 1,176.50، وآخر دفعة بكلفتها الفعلية 1,146.50',
  );
  t.same(
    [cardOf(cards, R3)?.expectedCostPerKg, cardOf(cards, R2)?.expectedCostPerKg, cardOf(cards, R2)?.draft?.id],
    [null, null, V2],
    'parseRecipes: لا كلفة متوقّعة لخلطة فيها مادّة بلا سعر ولا لمسوّدة',
  );
  const millerCardsRaw = (await call(U.miller, 'select public.recipes_overview()')).v;
  const millerCards = parsed('parseRecipes (مشغّل المعمل)', () => ui.parseRecipes(millerCardsRaw));
  t.same(
    millerCards && [millerCards.length, millerCards.flatMap((c) => [c.expectedCostPerKg, c.lastCostPerKg, c.lastBatch?.totalValue ?? null]).filter((x) => x !== null)],
    [4, []],
    'parseRecipes (مشغّل المعمل): أربع بطاقات بلا أيّ كلفة، ولا يرمي',
  );
  for (const [label, user] of [['المدير', U.manager], ['مشغّل المعمل', U.miller]]) {
    const raw = (await call(user, 'select public.productions_overview(null, 30)')).v;
    const page = parsed(`parseProductions (${label})`, () => ui.parseProductions(raw));
    // المسوّدة الثانية وحدها، والصفوف: الأولى ملغاة والثالثة وثلاث دفعات السباق مرحَّلة.
    t.same(page && [page.drafts.map((d) => d.id), page.rows.length], [[B2], 5], `parseProductions (${label}): المسوّدة والدفعات الخمس`);
  }

  // ─── إصلاحات مراجعة 0016 بمحلّلات الشاشات: كلّ مفتاح جديد من جواب القاعدة الحقيقي ─────────────────────────────────
  // المحاسب المحصور بمخزن المواد وحده (ق١١، م١٢): يرى الكلفة ولا يرى مصاريف وحدة المعمل، فالمتاح null وcosts_unfunded بلا أرقام.
  // الدفعة الثانية الآن: صويا 400 وحنطة 600 بديلاً للذرة (القسم ٥)، والحنطة المتاحة 300 وحدها؛ المواد 400 × 1,500 + 300 × 800 =
  // 840,000.00، والتكاليف 6,000 + 1,500 = 7,500.00، فالكلّي 847,500.00 والكيلو (الكتلة المخطّطة 1,000) 847.50. والمتاح لمن يرى
  // الوحدة: «أيدي عاملة» 5,000 − 500 (الثالثة) = 4,500.00، و«كهرباء» 4,000 − 150 = 3,850.00.
  const hiddenRaw = await preview(U.accRaw, B2);
  const hiddenView = parsed('parsePreview (محاسب المواد)', () => ui.parsePreview(hiddenRaw));
  t.same(
    hiddenView && [hiddenView.inputValue, hiddenView.extraValue, hiddenView.totalValue, hiddenView.costPerKg, hiddenView.inputWarehouse,
      hiddenView.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.available])],
    [84000000n, 750000n, 84750000n, 84750n, { id: RAW, name: RAW_NAME, divisionId: MILL, divisionName: MILL_NAME },
      [[1, 'أيدي عاملة', 500000n, 600000n, null], [2, 'كهرباء', 150000n, 150000n, null]]],
    'parsePreview (محاسب المواد): المال ظاهر (دور كلفة) ووحدة المخزن، والمتاح null لكلّ سطر (المفتاح موجود بقيمته)',
  );
  t.same(
    hiddenView?.problems.map((x) => [x.code, x.itemName, x.need, x.have, x.categoryId, x.categoryName, x.needAmount, x.haveAmount]),
    [['insufficient_stock', 'حنطة', 600000n, 300000n, null, null, null, null], ['costs_unfunded', null, null, null, null, null, null, null]],
    'parsePreview (محاسب المواد): costs_unfunded واحدة بلا فئة ولا أرقام كغير أدوار الكلفة، بعد نقص الحنطة',
  );
  const seenRaw = await preview(U.accountant, B2);
  const seenView = parsed('parsePreview (المحاسب، الآن)', () => ui.parsePreview(seenRaw));
  t.same(
    seenView && [seenView.costs?.map((c) => c.available), seenView.problems.filter((x) => x.code === 'costs_unfunded').map((x) => [x.categoryId, x.needAmount, x.haveAmount])],
    [[450000n, 385000n], [[LABOR, 600000n, 450000n]]],
    'ضابط: المحاسب بلا نطاق يرى في اللحظة نفسها المتاح 4,500.00 و3,850.00 والنقص بأرقامه',
  );
  // بطاقة الدفعة الثالثة لمحاسب المواد (ق١١، م١٢): القيم ظاهرة، والتحميلات null = «محمَّلة من مصاريف وحدة خارج نطاقك».
  const hiddenBatchRaw = (await call(U.accRaw, 'select public.production_detail($1)', [B3])).v;
  const hiddenBatch = parsed('parseBatch (محاسب المواد)', () => ui.parseBatch(hiddenBatchRaw));
  t.same(
    hiddenBatch && [hiddenBatch.inputValue, hiddenBatch.extraValue, hiddenBatch.totalValue,
      hiddenBatch.costs?.map((c) => [c.categoryName, c.amount, c.available, c.allocations]), hiddenBatch.lines.map((l) => l.draws?.map((d) => d.qty))],
    [11400000n, 65000n, 11465000n, [['أيدي عاملة', 50000n, null, null], ['كهرباء', 15000n, null, null]], [[60000n], [40000n]]],
    'parseBatch (محاسب المواد): allocations null لكلّ سطر تكاليف (المفتاح موجود)، والقيم والوجبات ظاهرة',
  );

  // آخر دفعة صنعت العلف (ق١٤، ع٢): الثالثة (الأولى ملغاة لا تُعدّ)، 100 كغم في مخزن العلف، بلا مال.
  const feedBuys = (user, warehouse) => call(user, 'select public.item_purchases($1, $2, null, 50)', [FEED, warehouse]);
  const madeFeed = { batchId: B3, docNo: posted3.v.doc_no, producedOn: TODAY, qtyKg: 100000n, warehouseName: FEEDWH_NAME };
  for (const [label, user] of [['المدير', U.manager], ['مشغّل المعمل', U.miller]]) {
    const raw = (await feedBuys(user, FEEDWH)).v;
    const page = parsed(`parseItemPurchases (${label}، العلف)`, () => ui.parseItemPurchases(raw));
    t.same(page && [page.lastProduction, page.rows.length], [madeFeed, 0], `parseItemPurchases (${label}): last_production آخر دفعة مرحَّلة صنعت العلف، ولا شراء`);
  }
  const rawScopeBuys = (await feedBuys(U.accRaw, null)).v;
  t.eq(parsed('parseItemPurchases (محاسب المواد، العلف)', () => ui.parseItemPurchases(rawScopeBuys))?.lastProduction, null,
    'parseItemPurchases (محاسب المواد): مخزن العلف خارج نطاقه، فـlast_production null');
  t.eq(code(await feedBuys(U.accRaw, FEEDWH)), 'out_of_scope', 'ضابط: محاسب المواد لا يقرأ مخزن العلف نفسه');

  // الوقود خارج كتلة الخلطة (ق٣، م١١): «بادئ بالكاز» ذرة 1,000 كغم + كاز 20 لتراً (بكثافة 0.85 = 17.000 كغم) للأساس 1,000 يتفعّل،
  // وحصّة الكاز 17 × 100 ÷ 1,000 = 1.70٪ خارج الكتلة.
  const KEROSENE = await one(U.manager, "insert into public.items (name, kind, base_unit, density_kg_per_l) values ('كاز المولّدة', 'fuel', 'L', 0.85) returning id");
  const R5 = id(143);
  const fueled = await createRecipe(U.manager, R5, id(144), 'بادئ بالكاز', FEED2, 1000, [{ item_id: CORN, qty: 1000, unit: 'kg' }, { item_id: KEROSENE, qty: 20, unit: 'L' }], [], true);
  t.same(parsed('parseCreatedRecipe (بالكاز)', () => ui.parseCreatedRecipe(fueled.v)), { id: R5, versionId: id(144), versionNo: 1, status: 'active', lines: 2, rates: 0 },
    `parseCreatedRecipe: خلطة بسطر كاز مفعَّلة والمجموع بلا الكاز = الأساس (${fueled.code ?? ''} ${fueled.hint ?? ''})`);
  const fueledRaw = (await call(U.manager, 'select public.recipe_detail($1, null)', [R5])).v;
  const fueledCard = parsed('parseRecipe (بالكاز)', () => ui.parseRecipe(fueledRaw));
  t.same(
    fueledCard && [fueledCard.basisKg, fueledCard.massKg, fueledCard.lines.map((l) => [l.itemName, l.kind, l.unit, l.qty, l.massKg, l.sharePct, l.inBasis])],
    [1000000n, 1000000n, [['ذرة صفراء', 'raw', 'kg', 1000000n, 1000000n, 10000n, true], ['كاز المولّدة', 'fuel', 'L', 20000n, 17000n, 170n, false]]],
    'parseRecipe: in_basis لكلّ سطر (الكاز خارج الكتلة)، وmass_kg 1,000 بلا الكاز',
  );

  // «نسخة جديدة» تنسخ المفعَّلة (ق١٣، م٧): مسوّدة «بادئ ذهبي» الثانية بسطري المفعَّلة ومعدّليها، والإعادة والمسوّدة القائمة ترجعانها.
  const newVersion = (user, recipe, vid) => call(user, 'select public.new_recipe_version($1, $2)', [recipe, vid]);
  const copiedRaw = await newVersion(U.manager, R1, id(141));
  const againRaw = await newVersion(U.manager, R1, id(141));
  const otherRaw = await newVersion(U.manager, R1, id(142));
  const COPIED = { recipeId: R1, versionId: id(141), versionNo: 2, status: 'draft', lines: 2, rates: 2, existing: false };
  t.same(parsed('parseNewRecipeVersion', () => ui.parseNewRecipeVersion(copiedRaw.v)), COPIED, `parseNewRecipeVersion: مسوّدة بسطري المفعَّلة ومعدّليها (${copiedRaw.code ?? ''} ${copiedRaw.hint ?? ''})`);
  t.same(
    [parsed('parseNewRecipeVersion (إعادة)', () => ui.parseNewRecipeVersion(againRaw.v)), parsed('parseNewRecipeVersion (مسوّدة قائمة)', () => ui.parseNewRecipeVersion(otherRaw.v))],
    [{ ...COPIED, existing: true }, { ...COPIED, existing: true }],
    'parseNewRecipeVersion: الإعادة بالمعرّف نفسه، ومعرّف آخر والمسوّدة قائمة: النسخة نفسها بـexisting',
  );
  const copiedDetail = (await call(U.manager, 'select public.recipe_detail($1, $2)', [R1, id(141)])).v;
  const copiedCard = parsed('parseRecipe (المسوّدة المنسوخة)', () => ui.parseRecipe(copiedDetail));
  t.same(
    copiedCard && [copiedCard.versionId, copiedCard.status, copiedCard.basisKg, copiedCard.lines.map((l) => [l.itemName, l.qty, l.unit, l.inBasis]),
      copiedCard.rates?.map((r) => [r.lineNo, r.categoryName, r.amountPerTon])],
    [id(141), 'draft', 1000000n, [['ذرة صفراء', 600000n, 'kg', true], ['كسبة صويا', 400000n, 'kg', true]], [[1, 'أيدي عاملة', 500000n], [2, 'كهرباء', 150000n]]],
    'parseRecipe (المسوّدة المنسوخة): الأساس والسطور والمعدّلات بترتيبها كما في المفعَّلة',
  );
  t.eq(code(await newVersion(U.miller, R1, id(142))), 'forbidden', 'new_recipe_version لفعل التفعيل: مشغّل المعمل ممنوع');

  // الناتج لا يولد منتهياً (ق٨، م١٤): علف يتابَع انتهاؤه بتاريخ قبل يوم الإنتاج بثلاثين يوماً (2026-11-04 − 30 = 2026-10-05)،
  // بمعاملة ترجع فلا يبقى منها صفّ.
  const expiredRaw = await db.asUser(U.manager, async (q) => {
    const feedX = (await q("insert into public.items (name, kind, base_unit, tracks_expiry) values ('علف بصلاحية', 'feed', 'kg', true) returning id")).rows[0].id;
    await q("select public.create_recipe($1, $2, 'خلطة بصلاحية', $3, 1000, $4::jsonb, '[]'::jsonb, true)", [id(145), id(146), feedX, JSON.stringify([{ item_id: CORN, qty: 1000, unit: 'kg' }])]);
    await q('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [id(147), id(146), RAW, FEEDWH]);
    await q('update public.production_batches set output_expiry_on = public.app_today() - 30 where id = $1', [id(147)]);
    return (await q('select public.preview_production($1) as p', [id(147)])).rows[0].p;
  });
  const expiredView = parsed('parsePreview (ناتج منتهٍ)', () => ui.parsePreview(expiredRaw));
  t.same(
    expiredView && [expiredView.outputExpiryOn, expiredView.canPost, expiredView.problems.map((x) => [x.code, x.expiryOn, x.producedOn, x.itemName])],
    ['2026-10-05', false, [['output_expired', '2026-10-05', TODAY, null]]],
    'parsePreview: output_expired بتاريخ انتهاء الناتج ويوم الإنتاج',
  );
  t.eq((await db.admin('select count(*)::int as n from public.production_batches where id = $1', [id(147)])).rows[0].n, 0, 'ضابط: معاملة الناتج المنتهي رجعت، لا دفعة باقية');

  // ─── ١١) الدمج (ب): repo الحقيقي على القاعدة الحقيقية — الطلب كما تبنيه الشاشة، والجواب بمحلّلها ──────────────────────────────
  // postgrest-js الحقيقي وfetch إلى miniPostgrest فوق db.asUser: اسم معامل لا تعرفه الدالّة يرجع PGRST202 كما يردّ PostgREST، وعمود
  // غير ممنوح أو سياسة ترفض بخطئها؛ والكتابة المشروطة تُعاد بعد «جواب ضاع» فتعرف نتيجتها (درس WP5 وWP6).
  const server = miniPostgrest(db);
  globalThis.__millPg = server;
  try {
    const repo = await screensRepo();
    const actAs = (user) => {
      server.user = user;
    };
    /** 'ok' أو رمز الرفض كما تراه الشاشة (RejectedError)، وغيره باسمه. */
    const rejected = async (promise) => {
      try {
        await promise;
        return 'ok';
      } catch (error) {
        return error instanceof repo.RejectedError ? error.code : `${error.name}: ${error.message}`;
      }
    };

    // بانية الخلطة بنداء واحد: 700 ذرة + 300 صويا = 1,000 كغم، و«أيدي عاملة» 4,000 لكلّ طنّ، مفعَّلة.
    actAs(U.manager);
    const NEW = {
      id: id(131),
      versionId: id(132),
      name: ' بادئ الشاشة ',
      outputItemId: FEED2,
      basisKg: 1000000n,
      lines: [{ itemId: CORN, qty: 700000n, unit: 'kg' }, { itemId: SOY, qty: 300000n, unit: 'kg' }],
      rates: [{ categoryId: LABOR, amountPerTon: 400000n }],
      activate: true,
    };
    const created = await repo.createRecipe(NEW);
    t.same(created, { id: id(131), versionId: id(132), versionNo: 1, status: 'active', lines: 2, rates: 1 }, 'createRecipe من الشاشة: create_recipe بمعاملاته كما تبنيها (الكميات والمبالغ نصوصاً)');
    t.same(await repo.createRecipe(NEW), created, 'createRecipe: الإعادة بالمعرّفين نفسيهما (جواب ضاع) ترجّع الموجود');
    t.eq(await rejected(repo.createRecipe({ ...NEW, name: 'بادئ آخر' })), 'id_conflict', 'createRecipe: المعرّف نفسه باسم آخر: id_conflict');
    // إصلاح ق٥ وم١: الإعادة تعرف نتيجتها هي — أيّ فرق في السطور أو ترتيبها أو المعدّلات أو الأساس أو طلب التفعيل id_conflict، لا «نجح»
    // بالمحفوظ القديم (والشاشة تُبقي المعرّفين وتقول إنّ ما حُفظ غير ما تراه، برابطه). والمحفوظ لا يتغيّر (loadRecipe بعده).
    t.same(
      [
        await rejected(repo.createRecipe({ ...NEW, lines: [{ itemId: CORN, qty: 600000n, unit: 'kg' }, { itemId: SOY, qty: 400000n, unit: 'kg' }] })),
        await rejected(repo.createRecipe({ ...NEW, lines: [...NEW.lines].reverse() })),
        await rejected(repo.createRecipe({ ...NEW, rates: [] })),
        await rejected(repo.createRecipe({ ...NEW, rates: [{ categoryId: LABOR, amountPerTon: 450000n }] })),
        await rejected(repo.createRecipe({ ...NEW, basisKg: 2000000n, lines: [{ itemId: CORN, qty: 1400000n, unit: 'kg' }, { itemId: SOY, qty: 600000n, unit: 'kg' }] })),
        await rejected(repo.createRecipe({ ...NEW, activate: false })),
      ],
      ['id_conflict', 'id_conflict', 'id_conflict', 'id_conflict', 'id_conflict', 'id_conflict'],
      'createRecipe: الإعادة بالمعرّفين نفسيهما بمحتوى آخر (السطور، وترتيبها، والمعدّلات، والأساس، وطلب التفعيل): id_conflict',
    );
    // سعر الطنّ للتخطيط: 700 × 950 (المكتوب) + 300 × 1,500 (آخر شراء) = 1,115,000.00، والمعدّل 4,000.00، فالطنّ 1,119,000.00.
    const builtCard = await repo.loadRecipe(id(131));
    t.same(
      [builtCard.status, builtCard.basisKg, builtCard.massKg, builtCard.lines.map((l) => [l.itemName, l.qty, l.costPrice, l.lastPrice, l.unitCost]),
        builtCard.rates?.map((r) => [r.categoryName, r.amountPerTon]), builtCard.expected],
      ['active', 1000000n, 1000000n, [['ذرة صفراء', 700000n, 95000n, 90000n, 90000n], ['كسبة صويا', 300000n, null, 150000n, 150000n]],
        [['أيدي عاملة', 400000n]], { materialsPerTon: 111500000n, ratesPerTon: 400000n, costPerTon: 111900000n, unpriced: 0 }],
      'loadRecipe (المدير): الخلطة كما بُنيت، وكلفة الطنّ المتوقّعة 1,119,000.00',
    );
    const builder = await repo.loadBuilder();
    t.same(
      [builder.categories.map((c) => c.name), builder.recipeNames.includes('بادئ الشاشة'), builder.feedItems.map((f) => f.name), builder.stores.map((s) => s.kind)],
      [['أيدي عاملة', 'تعبئة', 'كهرباء', 'نقل'], true, ['علف بادئ', 'علف ناهي'], ['feed', 'raw']],
      'loadBuilder: فئات المصاريف بقراءة مباشرة (الفعّالة غير النظامية)، والخلطات ومواد العلف ومخزنا المعمل',
    );
    actAs(U.miller);
    const builtMiller = await repo.loadRecipe(id(131));
    t.same([builtMiller.rates, builtMiller.expected, builtMiller.lines.map((l) => l.costPrice)], [null, null, [null, null]], 'loadRecipe (مشغّل المعمل): بلا مال ولا يرمي');

    // الدفعة 500 كغم: ذرة 350 وصويا 150، و«أيدي عاملة» 4,000 × 500 ÷ 1,000 = 2,000.00.
    const BATCH = id(230);
    await repo.createProduction(BATCH, id(132), 500000n, RAW, FEEDWH, TODAY);
    const fresh = await repo.loadBatch(BATCH);
    t.same(
      [fresh.status, fresh.lines.map((l) => [l.itemName, l.plannedQty]), fresh.costs],
      ['draft', [['ذرة صفراء', 350000n], ['كسبة صويا', 150000n]], null],
      'createProduction ثمّ loadBatch (مشغّل المعمل): المخطّط بالتناسب، وبلا تكاليف',
    );
    // المتاح من «أيدي عاملة» = الأسبوع الثاني 5,000 − تحميل الدفعة الثالثة 500 = 4,500.00. المواد 350 × 900 + 150 × 1,500 =
    // 540,000.00، والكلّي 542,000.00، والكيلو 1,084.00.
    actAs(U.accountant);
    const firstLook = await repo.previewProduction(BATCH);
    t.same(
      [firstLook.inputValue, firstLook.extraValue, firstLook.totalValue, firstLook.costPerKg, firstLook.canPost, firstLook.problems.map((x) => x.code),
        firstLook.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.source, c.available])],
      [54000000n, 200000n, 54200000n, 108400n, true, [], [[1, 'أيدي عاملة', 200000n, 200000n, 'recipe', 450000n]]],
      'previewProduction (المحاسب): التكاليف من الخلطة بالمتاح لها، والكلّي مواد + تكاليف',
    );

    actAs(U.miller);
    const bran = { batchId: BATCH, id: id(231), itemId: BRAN, qty: 20000n, replaces: null, reason: null };
    const added = await repo.addProductionInput(bran);
    t.same([added.id, added.lineNo], [id(231), 3], 'addProductionInput: نخالة 20 كغم سطراً ثالثاً');
    t.same(await repo.addProductionInput(bran), added, 'addProductionInput: الإعادة بالمعرّف نفسه ترجّع السطر نفسه');
    // إصلاح ق٦ وم٢: المعرّف نفسه بكمية أخرى id_conflict، لا السطر بكميته الأولى بصمت (والشاشة تولّد معرّفاً جديداً للكمية الجديدة).
    t.eq(await rejected(repo.addProductionInput({ ...bran, qty: 30000n })), 'id_conflict', 'addProductionInput: المعرّف نفسه بكمية أخرى (30 كغم بعد 20): id_conflict');
    const soyLine = fresh.lines.find((l) => l.itemName === 'كسبة صويا')?.id ?? null;
    const swapInput = { batchId: BATCH, id: id(232), itemId: WHEAT, qty: 150000n, replaces: soyLine, reason: ' نفدت الصويا ' };
    const swap = await repo.addProductionInput(swapInput);
    t.eq(swap.lineNo, 4, 'addProductionInput: الحنطة بدل الصويا سطراً رابعاً');
    t.same(
      [
        await repo.addProductionInput(swapInput),
        await rejected(repo.addProductionInput({ ...swapInput, reason: 'سبب آخر للتبديل' })),
        await rejected(repo.addProductionInput({ ...swapInput, replaces: null, reason: null })),
      ],
      [swap, 'id_conflict', 'id_conflict'],
      'addProductionInput: إعادة التبديل بعد جواب ضاع (والسطر المبدَّل حُذف) ترجّع السطر نفسه، وبسبب آخر أو بلا تبديل id_conflict',
    );
    t.eq(
      await rejected(repo.addProductionInput({ batchId: BATCH, id: id(233), itemId: SOY, qty: 1000n, replaces: id(231), reason: '  ' })),
      'reason_required',
      'addProductionInput: التبديل بسبب فارغ (الشاشة تشذّبه): reason_required',
    );
    await repo.deleteProductionInput(id(231), (await repo.loadBatch(BATCH)).version);
    t.same(
      (await repo.loadBatch(BATCH)).lines.map((l) => [l.itemName, l.plannedQty, l.isSubstitute, l.reason, l.replacedItemName]),
      [['ذرة صفراء', 350000n, false, null, null], ['حنطة', 150000n, true, 'نفدت الصويا', 'كسبة صويا']],
      'deleteProductionInput ثمّ loadBatch: النخالة حُذفت، والبديل باسم ما حلّ محلّه وسببه المشذَّب',
    );

    // سطر تكاليف يدويّ بكتابة مباشرة (costs.load): «نقل» 1,000.00 ثمّ 1,500.00 ثمّ يُحذف.
    actAs(U.accountant);
    await repo.addBatchCost(BATCH, id(234), TRANSPORT, 100000n);
    t.eq(await rejected(repo.addBatchCost(BATCH, id(234), TRANSPORT, 100000n)), 'ok', 'addBatchCost: الإعادة بالمعرّف نفسه بعد جواب ضاع = انكتب، لا خطأ');
    t.eq(await rejected(repo.addBatchCost(BATCH, id(234), TRANSPORT, 90000n)), 'amount_changed', 'addBatchCost: المعرّف نفسه بمبلغ آخر: amount_changed');
    t.eq(await rejected(repo.addBatchCost(BATCH, id(235), TRANSPORT, 50000n)), 'category_duplicated', 'addBatchCost: الفئة نفسها بسطر آخر: category_duplicated كما هو');
    await repo.setBatchCost(id(234), 100000n, 150000n);
    t.eq(await rejected(repo.setBatchCost(id(234), 100000n, 150000n)), 'ok', 'setBatchCost: الإعادة بعد جواب ضاع: صفر صفوف والمحفوظ = المطلوب ← انكتب');
    t.eq(await rejected(repo.setBatchCost(id(234), 100000n, 120000n)), 'amount_changed', 'setBatchCost: السابق تغيّر: amount_changed بلا كتابة');
    const withTransport = await repo.previewProduction(BATCH);
    t.same(
      withTransport.costs?.map((c) => [c.lineNo, c.categoryName, c.plannedAmount, c.amount, c.source, c.available]),
      [[1, 'أيدي عاملة', 200000n, 200000n, 'recipe', 450000n], [2, 'نقل', null, 150000n, 'manual', 2000000n]],
      'السطر اليدويّ في المعاينة: بلا محسوب، والمبلغ المعدَّل، ومتاح «نقل» 20,000.00',
    );
    await repo.deleteBatchCost(id(234), withTransport.version);
    t.same((await repo.previewProduction(BATCH)).costs?.map((c) => c.categoryName), ['أيدي عاملة'], 'deleteBatchCost يحذف السطر اليدويّ');

    // الكمية الفعلية الموزونة مشروطة بما شافته الشاشة: الحنطة 151 كغم.
    actAs(U.miller);
    await repo.setInputActual(id(232), null, 151000n);
    t.eq(await rejected(repo.setInputActual(id(232), null, 151000n)), 'ok', 'setInputActual: الإعادة بعد جواب ضاع = انكتب');
    t.eq(await rejected(repo.setInputActual(id(232), null, 152000n)), 'qty_changed', 'setInputActual: السابق تغيّر: qty_changed');

    // فئة مصروف من مكانها (م٣): حقل «فئة جديدة» في صفحة الدفعة يكتبها بـcreateExpenseCategory، وتصل منتقي التكاليف فوراً.
    actAs(U.accountant);
    const upkeep = await repo.createExpenseCategory('  صيانة المعمل  ');
    t.same([upkeep.name, upkeep.systemCode, upkeep.archived], ['صيانة المعمل', null, false], 'createExpenseCategory (م٣): المحاسب يضيف الفئة باسمها المشذَّب، غير نظامية');
    t.ok((await repo.loadExpenseCategories()).some((c) => c.id === upkeep.id && c.name === 'صيانة المعمل'), 'loadExpenseCategories: الفئة الجديدة في منتقي تكاليف الدفعة');
    // الختم بلا مصروف (ق٢): سطر «صيانة المعمل» 500.00 ولا مصروف بفئته، فلا يُختم ما يُرفض ترحيله.
    await repo.addBatchCost(BATCH, id(240), upkeep.id, 50000n);
    const sealNoFunds = await repo.confirmCosts(BATCH, (await repo.previewProduction(BATCH)).version).then(() => null, (error) => error);
    t.same(
      [sealNoFunds?.code, sealNoFunds?.hint],
      ['expense_overloaded', 'صيانة المعمل: المطلوب 500 والمتاح من المصاريف المسجّلة 0. سجّل المصروف أوّلاً أو قلّل المبلغ.'],
      'confirmCosts بلا مصروف للفئة: expense_overloaded بأرقامه للمحاسب كما تعرضه الشاشة',
    );
    // محاسب المواد (ق١١): المعاينة بلا متاح ولا أرقام، والختم يُرفض بتلميح بلا رقم واحد.
    actAs(U.accRaw);
    const rawLook = await repo.previewProduction(BATCH);
    t.same(
      [rawLook.costs?.map((c) => [c.categoryName, c.amount, c.available]), rawLook.problems.map((x) => [x.code, x.categoryId, x.needAmount, x.haveAmount])],
      [[['أيدي عاملة', 200000n, null], ['صيانة المعمل', 50000n, null]], [['costs_unfunded', null, null, null]]],
      'previewProduction (محاسب المواد): المتاح null لكلّ سطر، وcosts_unfunded بلا أرقام',
    );
    const rawSeal = await repo.confirmCosts(BATCH, rawLook.version).then(() => null, (error) => error);
    t.same([rawSeal?.code, /\d/u.test(rawSeal?.hint ?? '0'), (rawSeal?.hint ?? '').includes('صيانة المعمل')], ['expense_overloaded', false, true], `confirmCosts (محاسب المواد): expense_overloaded بالفئة وبلا رقم (${rawSeal?.hint})`);
    actAs(U.accountant);
    await repo.deleteBatchCost(id(240), (await repo.previewProduction(BATCH)).version);
    await repo.confirmCosts(BATCH, (await repo.previewProduction(BATCH)).version);
    actAs(U.miller);
    const ready = await repo.previewProduction(BATCH);
    t.same([ready.canPost, ready.problems, ready.costs, ready.totalValue, ready.inputMassKg], [true, [], null, null, 501000n], 'previewProduction (مشغّل المعمل بعد الختم): يرحّل، ولا مال');
    await repo.postProduction(BATCH, ready.version, ready.planToken, ref());
    // الكتلة 350 + 151 (الفعلي) = 501 كغم؛ المواد 350 × 900 + 151 × 800 = 435,800.00، والتكاليف 2,000.00 ← 437,800.00،
    // والكيلو 437,800 ÷ 501 = 873.85.
    actAs(U.manager);
    const done = await repo.loadBatch(BATCH);
    t.same(
      [done.status, done.outputQtyKg, done.inputValue, done.extraValue, done.totalValue, done.costPerKg, done.lines.map((l) => [l.itemName, l.usedQty, l.value])],
      ['posted', 501000n, 43580000n, 200000n, 43780000n, 87385n, [['ذرة صفراء', 350000n, 31500000n], ['حنطة', 151000n, 12080000n]]],
      'loadBatch (المدير، مرحَّلة): المسحوب الفعلي وقيمته والكلّي وكلفة الكيلو',
    );
    t.same(
      done.costs?.map((c) => [c.categoryName, c.amount, c.allocations.map((a) => [a.expenseId, a.amount, a.label])]),
      [['أيدي عاملة', 200000n, [[E2, 200000n, 'أجور الأسبوع الثاني']]]],
      'loadBatch: التحميل 2,000.00 من مصروف الأسبوع الثاني',
    );
    actAs(U.miller);
    const madeLot = (await repo.loadItemLots(FEED2, FEEDWH)).rows.find((r) => r.sourceId === BATCH);
    t.same(madeLot && [madeLot.sourceKind, madeLot.source, madeLot.qtyLeft], ['production', done.docNo, 501000n], 'loadItemLots (مشغّل المعمل): دفعة العلف «صُنعت بدفعة» رقمها');
    // بطاقة العلف المنتج (ع٢): loadItemPurchases يحمل آخر دفعة صنعته — هذه الدفعة (501 كغم)، أحدث من دفعات السباق الثلاث.
    const madeHere = { batchId: BATCH, docNo: done.docNo, producedOn: TODAY, qtyKg: 501000n, warehouseName: FEEDWH_NAME };
    t.same((await repo.loadItemPurchases(FEED2, FEEDWH)).lastProduction, madeHere, 'loadItemPurchases (مشغّل المعمل): lastProduction لبطاقة العلف المنتج');
    actAs(U.manager);
    t.same((await repo.loadItemPurchases(FEED2, null)).lastProduction, madeHere, 'loadItemPurchases (المدير، كلّ المخازن): lastProduction نفسه');
    actAs(U.accRaw);
    t.eq((await repo.loadItemPurchases(FEED2, null)).lastProduction, null, 'loadItemPurchases (محاسب المواد): مخزن العلف خارج نطاقه، فلا lastProduction');
    // وتحميلات بطاقة الدفعة محجوبة عنه (ق١١، م١٢): allocations null والقيم ظاهرة.
    const doneRaw = await repo.loadBatch(BATCH);
    t.same(
      [doneRaw.totalValue, doneRaw.costs?.map((c) => [c.categoryName, c.amount, c.allocations]), doneRaw.lines.map((l) => [l.itemName, l.draws?.map((d) => d.qty)])],
      [43780000n, [['أيدي عاملة', 200000n, null]], [['ذرة صفراء', [350000n]], ['حنطة', [151000n]]]],
      'loadBatch (محاسب المواد): التحميلات null، والقيمة والوجبات ظاهرة',
    );

    actAs(U.accountant);
    const second = (await repo.loadExpenses('2026-10-01', TODAY, null)).rows.find((r) => r.id === E2);
    t.same([second?.amount, second?.allocated], [500000n, 250000n], 'loadExpenses: المحمَّل من الأسبوع الثاني 500 + 2,000 = 2,500.00');
    // إلغاء المصروف المحمَّل من الشاشة (ش-أ ٦): الرفض برمزه وتلميحه الذي تعرضه كما هو (المبلغ والدفعتان وأوّلهما).
    actAs(U.manager);
    const refusal = await repo.voidExpense(ref(), E2, 'إلغاء من الشاشة').then(() => null, (error) => error);
    t.same(
      [refusal?.code, refusal?.hint],
      ['expense_allocated', `من هذا المصروف 2,500 محمَّلة على دفعات إنتاج عددها 2، أوّلها ${posted3.v.doc_no}؛ ألغِ الدفعات أوّلاً.`],
      'voidExpense من الشاشة: expense_allocated وتلميحه يسمّي المحمَّل والدفعتين وأوّلهما',
    );

    actAs(U.manager);
    const cornBuys = await repo.loadItemPurchases(CORN, RAW);
    t.same([cornBuys.item.costPrice, cornBuys.item.sellPrice, cornBuys.rows[0]?.money?.unitCost], [95000n, null, 90000n], 'loadItemPurchases (المدير): سعر الكلفة وآخر شراء');
    actAs(U.miller);
    const cornBuysMiller = await repo.loadItemPurchases(CORN, RAW);
    t.same([cornBuysMiller.item.costPrice, cornBuysMiller.rows[0]?.money], [null, null], 'loadItemPurchases (مشغّل المعمل): بلا أسعار');
    actAs(U.manager);
    t.eq(await repo.setItemCostPrice(SOY, 160000n, null), 160000n, 'setItemCostPrice: 1,600.00 لكيلو الصويا');
    t.eq(await repo.setItemCostPrice(SOY, 160000n, null), 160000n, 'setItemCostPrice: الإعادة ترجّع المكتوب');
    t.eq(await rejected(repo.setItemCostPrice(SOY, 170000n, null)), 'price_changed', 'setItemCostPrice: السابق غير الذي شافته الشاشة: price_changed');
    // بعد سعر الصويا المكتوب: 665,000 + 300 × 1,600 = 1,145,000.00، والطنّ 1,149,000.00، والكيلو 1,149.00.
    t.same(
      (await repo.loadRecipe(id(131))).expected,
      { materialsPerTon: 114500000n, ratesPerTon: 400000n, costPerTon: 114900000n, unpriced: 0 },
      'loadRecipe: سعر الكلفة المكتوب يدخل كلفة الطنّ المتوقّعة فوراً',
    );
    t.eq((await repo.loadMill()).recipes.find((r) => r.id === id(131))?.expectedCostPerKg, 114900n, 'loadMill (المدير): كلفة الكيلو المتوقّعة على البطاقة 1,149.00');
    actAs(U.miller);
    const millHome = await repo.loadMill();
    t.same(
      [millHome.recipes.find((r) => r.id === id(131))?.expectedCostPerKg, millHome.productions.rows.find((r) => r.id === BATCH)?.totalValue],
      [null, null],
      'loadMill (مشغّل المعمل): البطاقة والدفعة بلا كلفة',
    );

    // «نسخة جديدة» من بطاقة الخلطة (م٧): newRecipeVersion بمعرّف من الجهاز يبقى للإعادة، والمسوّدة بسطور المفعَّلة ومعدّليها.
    actAs(U.manager);
    const COPY = { recipeId: id(131), versionId: id(241), versionNo: 2, status: 'draft', lines: 2, rates: 1, existing: false };
    t.same(await repo.newRecipeVersion(id(131), id(241)), COPY, 'newRecipeVersion: مسوّدة ثانية بسطري «بادئ الشاشة» ومعدّله');
    t.same(
      [await repo.newRecipeVersion(id(131), id(241)), await repo.newRecipeVersion(id(131), id(242))],
      [{ ...COPY, existing: true }, { ...COPY, existing: true }],
      'newRecipeVersion: الإعادة بعد جواب ضاع، ومعرّف آخر والمسوّدة قائمة: المسوّدة نفسها (existing)',
    );
    const copyCard = await repo.loadRecipe(id(131), id(241));
    t.same(
      [copyCard.versionId, copyCard.status, copyCard.basisKg, copyCard.lines.map((l) => [l.itemName, l.qty, l.unit, l.inBasis]), copyCard.rates?.map((r) => [r.categoryName, r.amountPerTon])],
      [id(241), 'draft', 1000000n, [['ذرة صفراء', 700000n, 'kg', true], ['كسبة صويا', 300000n, 'kg', true]], [['أيدي عاملة', 400000n]]],
      'loadRecipe (المسوّدة المنسوخة): السطور والمعدّل كما في المفعَّلة',
    );
    t.eq((await repo.loadRecipe(id(131))).versionId, id(132), 'ضابط: بطاقة الخلطة بلا نسخة مختارة تبقى على المفعَّلة');
    actAs(U.miller);
    t.eq(await rejected(repo.newRecipeVersion(id(131), id(242))), 'forbidden', 'newRecipeVersion (مشغّل المعمل): forbidden');
    // «أنتج» من بطاقة الخلطة (م٩): مخازن المعمل ويوم الخادم من recipes_overview.
    t.same(
      (({ today, stores }) => [today, stores.map((s) => [s.id, s.kind])])(await repo.loadMillStores()),
      [TODAY, [[FEEDWH, 'feed'], [RAW, 'raw']]],
      'loadMillStores (مشغّل المعمل): يوم الخادم ومخزنا المعمل',
    );
    // «اجعلها مادّة أوّلية» (م٨): التوأم بالاسم من find_item_twins، وصفّه بـloadItem، والنوع بـupdateItem مشروطاً بالنسخة؛ والمادّة
    // التي عليها حركات مخزون frozen_column (الشاشة تقول أنشئ باسم آخر).
    actAs(U.manager);
    const made = await repo.createItem({ name: 'نخالة خشنة', category_id: null, kind: 'feed', base_unit: 'kg', density_kg_per_l: null, piece_mass_kg: null,
      tracks_expiry: false, scale_step: '0.100', min_qty: null, barcode: null, alt_codes: [] });
    const twins = await repo.findItemTwins(' نخالة  خشنة ', []);
    t.same(twins.filter((x) => x.sameName).map((x) => [x.id, x.archived]), [[made.id, false]], 'findItemTwins: التوأم بالاسم المطبَّع قبل أيّ إنشاء');
    const twinRow = await repo.loadItem(made.id);
    t.same([twinRow?.kind, (await repo.updateItem(made.id, twinRow.version, { kind: 'raw' })).kind], ['feed', 'raw'], 'updateItem: «اجعلها مادّة أوّلية» لمادّة بلا حركات');
    const feedRow = await repo.loadItem(FEED);
    t.eq(await rejected(repo.updateItem(FEED, feedRow.version, { kind: 'raw' })), 'frozen_column', 'updateItem: مادّة عليها حركات مخزون: frozen_column (pickers.kindFixFailure)');

    // معدّل تكاليف بنسخة مسوّدة (الخلطة التجريبية) بكتابة مباشرة (recipe.activate).
    actAs(U.manager);
    await repo.addRecipeRate(V2, id(236), PACKING, 50000n);
    t.eq(await rejected(repo.addRecipeRate(V2, id(236), PACKING, 50000n)), 'ok', 'addRecipeRate: الإعادة بعد جواب ضاع = انكتب');
    t.eq(await rejected(repo.addRecipeRate(V2, id(237), PACKING, 50000n)), 'category_duplicated', 'addRecipeRate: الفئة نفسها بسطر آخر: category_duplicated');
    await repo.setRecipeRate(id(236), 50000n, 60000n);
    t.eq(await rejected(repo.setRecipeRate(id(236), 50000n, 70000n)), 'amount_changed', 'setRecipeRate: السابق تغيّر: amount_changed');
    const trial = await repo.loadRecipe(R2);
    t.same(trial.rates?.map((r) => [r.lineNo, r.categoryName, r.amountPerTon]), [[1, 'تعبئة', 60000n]], 'loadRecipe (مسوّدة): المعدّل بعد تعديله');
    await repo.deleteRecipeRate(id(236), trial.versionVersion);
    t.same((await repo.loadRecipe(R2)).rates, [], 'deleteRecipeRate يحذفه');
    actAs(U.miller);
    t.eq(await rejected(repo.addRecipeRate(V2, id(238), PACKING, 50000n)), 'forbidden', 'addRecipeRate (مشغّل المعمل): forbidden من الحارس');
  } finally {
    delete globalThis.__millPg;
  }
  t.same([await nonZero('verify_mill'), await nonZero('verify_stock')], [{}, {}], 'الثوابت صفر بالنهاية (بعد الدمج)');
}
